import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { QueuedPrompt } from "@/components/agent/types";
import {
	Queue,
	QueueItem,
	QueueItemAction,
	QueueItemActions,
	QueueItemContent,
	QueueItemIndicator,
	QueueList,
	QueueSection,
	QueueSectionContent,
	QueueSectionLabel,
	QueueSectionTrigger,
} from "@/components/ai-elements/queue";

export function ComposerQueue({
	messageQueue,
	onRemoveQueuedMessage,
}: {
	messageQueue: QueuedPrompt[];
	onRemoveQueuedMessage: (id: string) => void;
}) {
	const { t } = useTranslation("agent");
	if (messageQueue.length === 0) return null;
	return (
		<Queue>
			<QueueSection defaultOpen>
				<QueueSectionTrigger>
					<QueueSectionLabel
						count={messageQueue.length}
						label={t("composer.queueLabel")}
					/>
				</QueueSectionTrigger>
				<QueueSectionContent>
					<QueueList>
						{messageQueue.map((item) => {
							const imageCount = item.images?.length ?? 0;
							const queueLabel =
								item.text.trim() ||
								(item.visualDrafts.length
									? t("composer.visualAnnotationsTitle", {
											count: item.visualDrafts.length,
										})
									: imageCount > 0
										? t("composer.attachedImagesTitle", {
												count: imageCount,
											})
										: t("composer.visualAnnotation"));
							return (
								<QueueItem key={item.id}>
									<div className="flex w-full items-center gap-2">
										<QueueItemIndicator />
										<QueueItemContent title={queueLabel}>
											{queueLabel}
										</QueueItemContent>
										<QueueItemActions>
											<QueueItemAction
												aria-label={t("composer.queueRemove")}
												title={t("composer.queueRemove")}
												onClick={() => onRemoveQueuedMessage(item.id)}
											>
												<X className="size-3.5" />
											</QueueItemAction>
										</QueueItemActions>
									</div>
								</QueueItem>
							);
						})}
					</QueueList>
				</QueueSectionContent>
			</QueueSection>
		</Queue>
	);
}
