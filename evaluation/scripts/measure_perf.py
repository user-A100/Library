#!/usr/bin/env python3
"""D7 精简实测：时间（3 次均值）+ 峰值内存（外部采样，仅离线用例）。

不测 arXiv（429 限流重试会污染耗时数据），网络用例只测 ModelScope 1 页。
"""
import os, subprocess, sys, time, json, threading

CLI = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "apps/library-workbench/target/debug/library-cli.exe")
env = dict(os.environ)
env["NO_PROXY"] = "*"; env["no_proxy"] = "*"
env.pop("HTTP_PROXY", None); env.pop("HTTPS_PROXY", None)
env.pop("http_proxy", None); env.pop("https_proxy", None)

def timed(args, timeout=90):
    t0 = time.perf_counter()
    p = subprocess.run([CLI] + args, capture_output=True, env=env, timeout=timeout)
    return time.perf_counter() - t0, p.returncode, len(p.stdout)

def peak_mem(args, timeout=90):
    """启动子进程并外部采样峰值 WorkingSet（MB）。

    优先 psutil（每进程 Peak working set 无需采样循环）；
    否则 PowerShell Get-Process 10ms 轮询采样。
    """
    try:
        import psutil
        p = subprocess.Popen([CLI] + args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        pu = psutil.Process(p.pid)
        peak = 0
        while p.poll() is None:
            try:
                peak = max(peak, pu.memory_info().wset)
            except psutil.NoSuchProcess:
                break
            time.sleep(0.01)
        return peak / 1e6
    except ImportError:
        pass
    p = subprocess.Popen([CLI] + args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    ps = (
        "while(-not (Get-Process -Id %d -ErrorAction SilentlyContinue)){Start-Sleep -m 5};"
        "$peak=0; while(-not (Get-Process -Id %d -ErrorAction SilentlyContinue).HasExited){"
        "$w=(Get-Process -Id %d).WorkingSet64; if($w -gt $peak){$peak=$w}; Start-Sleep -m 10}; "
        "'{0:N0}' -f $peak" % (p.pid, p.pid, p.pid)
    )
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, timeout=timeout)
    try:
        return float(r.stdout.strip().replace(",", "")) / 1e6
    except ValueError:
        p.wait(); return -1.0

VAULT = os.environ.get("LIBRARY_VAULT", r"C:\Users\111222\Desktop\paper")
CASES = [
    ("startup（--help，纯启动基线）", ["--help"], False),
    ("paper-list（11 篇 vault 全量）", ["--vault", VAULT, "paper", "list"], False),
    ("plaza-modelscope（12 页 600 条+过滤，真实工作负载）", ["--vault", VAULT, "plaza", "modelscope", "--query", "情感计算", "--pages", "12", "--page-size", "50"], True),
]

out = []
for name, args, net in CASES:
    times = []
    for _ in range(3):
        try:
            dt, rc, outlen = timed(args, timeout=60 if net else 30)
        except subprocess.TimeoutExpired:
            times = None; out.append({"case": name, "error": "timeout"}); break
        if rc != 0:
            times = None; out.append({"case": name, "error": f"rc={rc}"}); break
        times.append(dt)
    if times is None: continue
    mem = peak_mem(args)
    row = {"case": name, "time_avg_s": round(sum(times)/3, 2), "time_min_s": round(min(times), 2),
           "peak_mem_mb": round(mem, 1), "stdout_bytes": outlen}
    out.append(row); print(json.dumps(row, ensure_ascii=False))

json.dump(out, open("evaluation/results/perf-results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("saved evaluation/results/perf-results.json")
