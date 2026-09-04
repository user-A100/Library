import { cn } from "@/lib/core/utils";

/** Big onboarding action card (icon + title), used across wizard steps. */
export function ChoiceCard({
	icon,
	title,
	onClick,
}: {
	icon: React.ReactNode;
	title: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-center justify-center gap-2.5 rounded-xl border bg-background p-5 text-center outline-none transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
			)}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
				{icon}
			</div>
			<p className="font-medium text-sm">{title}</p>
		</button>
	);
}
