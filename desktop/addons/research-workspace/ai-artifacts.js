// Versioned, machine-readable research artifacts for Library AI.
// This file intentionally has no Zotero dependencies so the exact runtime
// contract can also be exercised by Node/Vitest.
var LibraryAIArtifacts = (() => {
	const SCHEMA_VERSION = "library.trace/v1";
	const DECISION_VERDICTS = new Set(["accepted", "rejected", "edited", "rebound"]);
	const DECISION_ACTORS = new Set(["user", "reviewer", "system"]);

	function normalizeText(value) {
		return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
	}

	async function sha256(value, cryptoProvider = globalThis.crypto, TextEncoderImpl = globalThis.TextEncoder) {
		if (!cryptoProvider?.subtle || !TextEncoderImpl) throw new Error("SHA-256 runtime is unavailable");
		let bytes = new TextEncoderImpl().encode(String(value || ""));
		let digest = await cryptoProvider.subtle.digest("SHA-256", bytes);
		return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
	}

	function citationIDs(value) {
		return [...new Set([...String(value || "").matchAll(/\[\[([A-Z]\d+-C\d+)\]\]/g)].map(match => match[1]))];
	}

	function claimsFromMarkdown(content) {
		let withoutCode = String(content || "").replace(/```[\s\S]*?```/g, " ");
		let segments = withoutCode
			.split(/\n+|(?<=[。！？])(?=\S)|(?<=[.!?])\s+/)
			.map(value => value.replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)、])\s*/, "").trim())
			.filter(value => normalizeText(value.replace(/\[\[[A-Z]\d+-C\d+\]\]/g, "")).length >= 6);
		return segments.map((segment, index) => {
			let evidenceIDs = citationIDs(segment);
			return {
				id: `C${index + 1}`,
				text: normalizeText(segment.replace(/\[\[[A-Z]\d+-C\d+\]\]/g, "")),
				criticality: "unspecified",
				epistemicStatus: "unclassified",
				evidenceIDs,
				verificationStatus: evidenceIDs.length ? "unjudged" : "unsupported",
			};
		});
	}

	async function evidenceFromCitation(id, citation, cryptoProvider, TextEncoderImpl) {
		let quote = normalizeText(citation?.text);
		let page = Number.isInteger(citation?.page) && citation.page > 0 ? citation.page : null;
		let annotationKey = citation?.annotationKey ? String(citation.annotationKey) : null;
		return {
			id,
			sourceItemID: Number(citation?.sourceItemID) || null,
			sourceItemKey: citation?.sourceItemKey ? String(citation.sourceItemKey) : "",
			attachmentID: Number(citation?.attachmentID) || null,
			attachmentKey: citation?.attachmentKey ? String(citation.attachmentKey) : null,
			annotationKey,
			page,
			recordID: String(citation?.id || ""),
			blockID: citation?.blockID ? String(citation.blockID) : String(citation?.id || ""),
			startOffset: Number.isInteger(citation?.startOffset) ? citation.startOffset : null,
			endOffset: Number.isInteger(citation?.endOffset) ? citation.endOffset : null,
			parserVersion: citation?.parserVersion ? String(citation.parserVersion) : "unversioned",
			sourceHash: citation?.sourceHash ? String(citation.sourceHash) : null,
			quote,
			quoteHash: await sha256(quote, cryptoProvider, TextEncoderImpl),
			locatorStatus: quote && (page || annotationKey) ? "locatable" : "unresolved",
			retrieval: citation?.retrieval || "lexical",
		};
	}

	function validateBundle(bundle) {
		let errors = [], hardFailures = [];
		if (bundle?.schemaVersion !== SCHEMA_VERSION) errors.push("unsupported_schema_version");
		if (!bundle?.run?.runID) errors.push("missing_run_id");
		if (!/^[0-9a-f]{64}$/.test(bundle?.run?.promptHash || "")) errors.push("invalid_prompt_hash");
		if (!/^[0-9a-f]{64}$/.test(bundle?.run?.responseHash || "")) errors.push("invalid_response_hash");
		if (!["done", "stopped", "error"].includes(bundle?.run?.state)) errors.push("invalid_run_state");
		for (let source of bundle?.run?.sourceScope || []) {
			if (!Number.isInteger(source.itemID) || source.itemID < 1 || !source.itemKey) {
				hardFailures.push({ code: "invalid_source_scope", itemID: source.itemID || null });
			}
		}
		let evidenceByID = new Map((bundle?.evidence || []).map(item => [item.id, item]));
		let allowedSources = new Set((bundle?.run?.sourceScope || []).map(item => Number(item.itemID)));
		for (let evidence of bundle?.evidence || []) {
			if (!evidence.id || !evidence.sourceItemID || !evidence.sourceItemKey || !evidence.recordID || !evidence.quote || !evidence.quoteHash) {
				hardFailures.push({ code: "invalid_evidence_record", evidenceID: evidence.id || null });
			}
			if (allowedSources.size && !allowedSources.has(Number(evidence.sourceItemID))) {
				hardFailures.push({ code: "source_out_of_scope", evidenceID: evidence.id });
			}
		}
		for (let claim of bundle?.claims || []) {
			for (let evidenceID of claim.evidenceIDs || []) {
				if (!evidenceByID.has(evidenceID)) hardFailures.push({ code: "unknown_evidence_id", claimID: claim.id, evidenceID });
			}
		}
		let duplicateClaimIDs = (bundle?.claims || []).map(item => item.id)
			.filter((id, index, values) => values.indexOf(id) !== index);
		if (duplicateClaimIDs.length) hardFailures.push({ code: "duplicate_claim_id", claimIDs: [...new Set(duplicateClaimIDs)] });
		let duplicateEvidenceIDs = (bundle?.evidence || []).map(item => item.id)
			.filter((id, index, values) => values.indexOf(id) !== index);
		if (duplicateEvidenceIDs.length) hardFailures.push({ code: "duplicate_evidence_id", evidenceIDs: [...new Set(duplicateEvidenceIDs)] });
		let claimsByID = new Map((bundle?.claims || []).map(item => [item.id, item]));
		let decisionIDs = new Set(), latestDecisionByClaim = new Map();
		for (let decision of bundle?.decisions || []) {
			if (!decision.id || decisionIDs.has(decision.id)) hardFailures.push({ code: "duplicate_decision_id", decisionID: decision.id || null });
			decisionIDs.add(decision.id);
			if (!claimsByID.has(decision.claimID)) hardFailures.push({ code: "unknown_decision_claim", decisionID: decision.id, claimID: decision.claimID });
			if (!DECISION_VERDICTS.has(decision.verdict) || !DECISION_ACTORS.has(decision.actor)) hardFailures.push({ code: "invalid_decision", decisionID: decision.id });
			let replacementEvidenceIDs = decision.replacementEvidenceIDs || [];
			for (let evidenceID of replacementEvidenceIDs) {
				if (!evidenceByID.has(evidenceID)) hardFailures.push({ code: "unknown_decision_evidence", decisionID: decision.id, evidenceID });
			}
			if (decision.verdict === "edited" && !normalizeText(decision.replacementText)) hardFailures.push({ code: "missing_replacement_text", decisionID: decision.id });
			if (decision.verdict === "rebound" && !replacementEvidenceIDs.length) hardFailures.push({ code: "missing_replacement_evidence", decisionID: decision.id });
			if (decision.verdict === "rejected" && !normalizeText(decision.reason)) hardFailures.push({ code: "missing_rejection_reason", decisionID: decision.id });
			let previous = latestDecisionByClaim.get(decision.claimID) || null;
			if ((decision.previousDecisionID || null) !== (previous?.id || null)) hardFailures.push({ code: "invalid_decision_chain", decisionID: decision.id, expectedPreviousDecisionID: previous?.id || null });
			latestDecisionByClaim.set(decision.claimID, decision);
		}
		return { errors, hardFailures, structuralPassed: !errors.length && !hardFailures.length, semanticStatus: "not_evaluated" };
	}

	async function verifyBundle(bundle, { cryptoProvider = globalThis.crypto, TextEncoderImpl = globalThis.TextEncoder } = {}) {
		let validation = validateBundle(bundle);
		let expectedResponseHash = await sha256(String(bundle?.run?.rawResponse || ""), cryptoProvider, TextEncoderImpl);
		if (bundle?.run?.responseHash !== expectedResponseHash) validation.hardFailures.push({ code: "response_hash_mismatch" });
		let expectedPromptHash = await sha256(JSON.stringify(bundle?.run?.requestMessages || []), cryptoProvider, TextEncoderImpl);
		if (bundle?.run?.promptHash !== expectedPromptHash) validation.hardFailures.push({ code: "prompt_hash_mismatch" });
		for (let evidence of bundle?.evidence || []) {
			let expectedQuoteHash = await sha256(normalizeText(evidence.quote), cryptoProvider, TextEncoderImpl);
			if (evidence.quoteHash !== expectedQuoteHash) validation.hardFailures.push({ code: "quote_hash_mismatch", evidenceID: evidence.id });
		}
		validation.structuralPassed = !validation.errors.length && !validation.hardFailures.length;
		validation.unresolvedEvidenceIDs = (bundle?.evidence || []).filter(item => item.locatorStatus === "unresolved").map(item => item.id);
		validation.uncitedClaimIDs = (bundle?.claims || []).filter(claim => !claim.evidenceIDs.length).map(claim => claim.id);
		return validation;
	}

	async function buildBundle({
		runID, question, content, citations = {}, audit = {}, providerID = "", providerPreset = "custom", model = "",
		sourceScope = [], requestMessages = [], state = "done", createdAt, completedAt,
		cryptoProvider = globalThis.crypto, TextEncoderImpl = globalThis.TextEncoder,
	}) {
		let evidence = await Promise.all(Object.entries(citations).map(([id, citation]) =>
			evidenceFromCitation(id, citation, cryptoProvider, TextEncoderImpl)));
		let claims = claimsFromMarkdown(content);
		let knownEvidenceIDs = new Set(evidence.map(item => item.id));
		let referencedIDs = citationIDs(content);
		let invalidCitationIDs = referencedIDs.filter(id => !knownEvidenceIDs.has(id));
		let run = {
			runID: String(runID || ""),
			profileID: String(providerID || ""),
			providerPreset: String(providerPreset || "custom"),
			model: String(model || ""),
			state,
			question: normalizeText(question),
			createdAt: createdAt || new Date().toISOString(),
			completedAt: completedAt || new Date().toISOString(),
			promptHash: "",
			responseHash: await sha256(String(content || ""), cryptoProvider, TextEncoderImpl),
			requestMessages: requestMessages.map(message => ({ role: String(message.role || ""), content: String(message.content || "") })),
			rawResponse: String(content || ""),
				sourceScope: sourceScope.map(source => ({
				itemID: Number(source.itemID), itemKey: String(source.itemKey || ""),
				attachmentID: Number(source.attachmentID) || null, attachmentKey: source.attachmentKey ? String(source.attachmentKey) : null,
				title: String(source.title || ""), level: source.level || "full",
			})),
			retrieval: {
				mode: audit.mode || "chat",
				queries: (audit.queries || []).map(String),
				evidenceIDs: evidence.map(item => item.id),
			},
		};
		run.promptHash = await sha256(JSON.stringify(run.requestMessages), cryptoProvider, TextEncoderImpl);
		let bundle = { schemaVersion: SCHEMA_VERSION, run, claims, evidence, decisions: [] };
		let validation = await verifyBundle(bundle, { cryptoProvider, TextEncoderImpl });
		for (let id of invalidCitationIDs) {
			if (!validation.hardFailures.some(failure => failure.code === "unknown_evidence_id" && failure.evidenceID === id)) {
				validation.hardFailures.push({ code: "unknown_evidence_id", evidenceID: id });
			}
		}
		validation.structuralPassed = !validation.errors.length && !validation.hardFailures.length;
		bundle.validation = validation;
		return bundle;
	}

	function claimReviewState(bundle, claimID) {
		let claim = bundle?.claims?.find(candidate => candidate.id === claimID);
		if (!claim) throw new Error("Unknown claim");
		let state = { claimID, text: claim.text, evidenceIDs: [...(claim.evidenceIDs || [])], currentDecision: null };
		for (let decision of bundle?.decisions || []) {
			if (decision.claimID !== claimID) continue;
			if (normalizeText(decision.replacementText)) state.text = normalizeText(decision.replacementText);
			if ((decision.replacementEvidenceIDs || []).length) state.evidenceIDs = [...decision.replacementEvidenceIDs];
			state.currentDecision = decision;
		}
		return state;
	}

	function appendDecision(bundle, decision) {
		if (!bundle?.claims?.some(claim => claim.id === decision?.claimID)) throw new Error("Decision references an unknown claim");
		if (!DECISION_VERDICTS.has(decision?.verdict)) throw new Error("Unsupported decision verdict");
		if (!DECISION_ACTORS.has(decision?.actor || "user")) throw new Error("Unsupported decision actor");
		let replacementText = decision.replacementText ? normalizeText(decision.replacementText) : null;
		let replacementEvidenceIDs = [...new Set((decision.replacementEvidenceIDs || []).map(String))];
		let evidenceIDs = new Set((bundle.evidence || []).map(item => item.id));
		if (replacementEvidenceIDs.some(id => !evidenceIDs.has(id))) throw new Error("Decision references unknown evidence");
		if (decision.verdict === "edited" && !replacementText) throw new Error("Edited decisions require replacement text");
		if (decision.verdict === "rebound" && !replacementEvidenceIDs.length) throw new Error("Rebound decisions require evidence");
		if (decision.verdict === "rejected" && !normalizeText(decision.reason)) throw new Error("Rejected decisions require a reason");
		let next = structuredClone(bundle);
		let current = [...next.decisions].reverse().find(candidate => candidate.claimID === decision.claimID) || null;
		if (Object.prototype.hasOwnProperty.call(decision, "previousDecisionID") && (decision.previousDecisionID || null) !== (current?.id || null)) throw new Error("Decision chain is stale");
		let usedIDs = new Set(next.decisions.map(item => item.id));
		if (decision.id && usedIDs.has(decision.id)) throw new Error("Decision ID already exists");
		let sequence = next.decisions.length + 1;
		while (usedIDs.has(`D${sequence}`)) sequence++;
		next.decisions.push({
			id: decision.id || `D${sequence}`,
			claimID: decision.claimID,
			actor: decision.actor || "user",
			verdict: decision.verdict,
			reason: normalizeText(decision.reason),
			replacementText,
			replacementEvidenceIDs,
			previousDecisionID: current?.id || null,
			createdAt: decision.createdAt || new Date().toISOString(),
		});
		return next;
	}

	return { SCHEMA_VERSION, normalizeText, sha256, citationIDs, claimsFromMarkdown, validateBundle, verifyBundle, buildBundle, claimReviewState, appendDecision };
})();
