import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import agenteroLogo from "@/assets/agentero-logo.svg";
import { useBridgeStatus } from "@/components/mobile/hooks/use-bridge-status";
import { useMobileAgents } from "@/components/mobile/hooks/use-mobile-agents";
import { useMobilePapers } from "@/components/mobile/hooks/use-mobile-papers";
import { usePairOfferLinks } from "@/components/mobile/hooks/use-pair-offer-links";
import { MobileAgentPage } from "@/components/mobile/mobile-agent-page";
import {
	EdgeSwipeBack,
	useHorizontalSwipe,
} from "@/components/mobile/mobile-gestures";
import { MobileHeader } from "@/components/mobile/mobile-header";
import {
	MobileAgentToolbar,
	MobileReaderModeToggle,
} from "@/components/mobile/mobile-header-actions";
import { MobileLibraryPage } from "@/components/mobile/mobile-library-page";
import { MobileNav, type MobileTab } from "@/components/mobile/mobile-nav";
import { MobilePairing } from "@/components/mobile/mobile-pairing";
import { MobileReaderPage } from "@/components/mobile/mobile-reader-page";
import { MobileSidebar } from "@/components/mobile/mobile-sidebar";
import type { MobileReaderMode } from "@/components/mobile/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PaperMetadata } from "@/lib/paper/types";

export default function MobileApp() {
	const { t } = useTranslation("mobile");
	const [tab, setTab] = useState<MobileTab>("library");
	const [libraryQuery, setLibraryQuery] = useState("");
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [pairingRequested, setPairingRequested] = useState(false);
	const [pendingOffer, setPendingOffer] = useState<string | null>(null);
	const [selectedPaper, setSelectedPaper] = useState<PaperMetadata | null>(
		null,
	);
	const [readerMode, setReaderMode] = useState<MobileReaderMode>("pdf");
	const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
	const [historyOpen, setHistoryOpen] = useState(false);

	const { status, setStatus, pairPending } = useBridgeStatus();
	const paired = status.paired;
	const connected = status.connected;
	const { papers, loading: papersLoading } = useMobilePapers({
		paired,
		connected,
		libraryVisible: tab === "library",
	});
	const {
		agents,
		loading: agentsLoading,
		selectedAgent,
		selectedAgentId,
		selectAgent,
	} = useMobileAgents({
		paired,
		connected,
		agentVisible: tab === "agent",
	});

	const acceptPairOffer = useCallback((offerUrl: string) => {
		setPendingOffer(offerUrl);
		setPairingRequested(true);
	}, []);
	usePairOfferLinks(acceptPairOffer);

	useEffect(() => {
		if (paired) return;
		setSelectedPaper(null);
		setAgentSessionId(null);
	}, [paired]);

	const closeReader = useCallback(() => {
		setSelectedPaper(null);
		setReaderMode("pdf");
	}, []);

	const handleSelectAgent = useCallback(
		(agentId: string) => {
			if (agentId === selectedAgentId) return;
			selectAgent(agentId);
			setAgentSessionId(null);
		},
		[selectedAgentId, selectAgent],
	);

	const swipeHandlers = useHorizontalSwipe(
		({ dx, dy, fromEdge, durationMs }) => {
			if (sidebarOpen || selectedPaper) return;
			if (durationMs > 500 || Math.abs(dy) > 60) return;
			const horizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
			if (!horizontal) return;
			if (dx > 60 && fromEdge) {
				setSidebarOpen(true);
				return;
			}
			if (dx < -60 && tab === "library") {
				setTab("agent");
				return;
			}
			if (dx > 60 && tab === "agent") {
				setTab("library");
			}
		},
	);

	if (!paired || pairingRequested) {
		return (
			<MobilePairing
				status={status}
				pending={pairPending}
				initialOffer={pendingOffer}
				onStatus={setStatus}
				onDone={() => {
					setPendingOffer(null);
					setPairingRequested(false);
				}}
			/>
		);
	}

	const inReader = tab === "library" && selectedPaper !== null;

	return (
		<div
			className="mobile-shell flex h-dvh min-h-0 overflow-hidden bg-background text-foreground"
			{...swipeHandlers}
		>
			<aside className="hidden w-20 shrink-0 flex-col items-center border-r bg-muted/25 py-6 md:flex">
				<MobileBrand />
				<MobileNav
					tab={tab}
					onTab={setTab}
					agentTemplate={selectedAgent?.template}
				/>
			</aside>
			<main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
				<MobileHeader
					title={inReader ? selectedPaper.title : t(`tabs.${tab}`)}
					status={status}
					statusLabel={
						connected ? t("settings.connected") : t("settings.offline")
					}
					brand={<MobileBrand />}
					brandButtonLabel={t("settings.menu")}
					onBrandClick={() => setSidebarOpen(true)}
					showBrand={!selectedPaper}
					leading={
						inReader ? (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("reader.back")}
								onClick={closeReader}
							>
								<ArrowLeft className="size-4" />
							</Button>
						) : undefined
					}
					trailing={
						inReader ? (
							<MobileReaderModeToggle
								mode={readerMode}
								onChange={setReaderMode}
							/>
						) : tab === "library" ? (
							<div className="relative w-[min(10rem,38vw)] shrink-0">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={libraryQuery}
									onChange={(event) => setLibraryQuery(event.target.value)}
									placeholder={t("library.search")}
									aria-label={t("library.search")}
									className="h-10 w-full pl-8 text-base md:text-sm"
								/>
							</div>
						) : (
							<MobileAgentToolbar
								agents={agents}
								loading={agentsLoading}
								selectedAgentId={selectedAgentId}
								onSelectAgent={handleSelectAgent}
								onOpenHistory={() => setHistoryOpen(true)}
							/>
						)
					}
				/>
				<div className="h-16 shrink-0 md:hidden" aria-hidden="true" />
				<div className="min-h-0 flex-1 overflow-hidden">
					{tab === "library" ? (
						selectedPaper ? (
							<EdgeSwipeBack onBack={closeReader}>
								<MobileReaderPage paper={selectedPaper} mode={readerMode} />
							</EdgeSwipeBack>
						) : (
							<MobileLibraryPage
								papers={papers}
								loading={papersLoading}
								selected={selectedPaper}
								onSelect={setSelectedPaper}
								query={libraryQuery}
							/>
						)
					) : null}
					{tab === "agent" ? (
						<MobileAgentPage
							key={selectedAgentId ?? "default"}
							selectedAgentId={selectedAgentId}
							sessionId={agentSessionId}
							onSessionId={setAgentSessionId}
							historyOpen={historyOpen}
							onHistoryOpenChange={setHistoryOpen}
						/>
					) : null}
				</div>
			</main>
			<MobileSidebar
				open={sidebarOpen}
				status={status}
				onClose={() => setSidebarOpen(false)}
				onStatus={setStatus}
				onPairAnother={() => {
					setPendingOffer(null);
					setPairingRequested(true);
				}}
			/>
		</div>
	);
}

function MobileBrand() {
	return <img src={agenteroLogo} alt="Agentero" className="size-8" />;
}
