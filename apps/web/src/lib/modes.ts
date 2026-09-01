import type { UserMode } from "@/lib/api";

/** Per-mode presentation config shared across pages. */

export interface ModeConfig {
  key: UserMode;
  label: string;
  shortLabel: string;
  heading: string;
  description: string;
  longDescription: string;
  starterQuestions: string[];
}

export const MODES: Record<UserMode, ModeConfig> = {
  citizen: {
    key: "citizen",
    label: "Citizen",
    shortLabel: "Citizen",
    heading: "Everyday legal help",
    description: "Plain-language answers about your rights and the law in Pakistan.",
    longDescription:
      "Get clear, jargon-free explanations of Pakistani law — contracts, tenancy, family matters, consumer rights — with the exact sections cited so you can verify everything.",
    starterQuestions: [
      "What makes a contract valid in Pakistan?",
      "What are my rights as a tenant in Pakistan?",
      "What should I check before signing an employment contract?",
      "How do I file a consumer complaint about a defective product?",
    ],
  },
  student: {
    key: "student",
    label: "Law Student",
    shortLabel: "Student",
    heading: "Study & exam prep",
    description: "Detailed, structured explanations with doctrine and case context.",
    longDescription:
      "Structured breakdowns with statutory text, section-by-section analysis, and exam-ready frameworks — ideal for LL.B. coursework and bar preparation in Pakistan.",
    starterQuestions: [
      "Explain the essentials of a valid contract with section numbers.",
      "Compare coercion and undue influence under the Contract Act.",
      "What is the difference between void and voidable agreements?",
      "Summarize the rules regarding contingent contracts.",
    ],
  },
  lawyer: {
    key: "lawyer",
    label: "Lawyer",
    shortLabel: "Lawyer",
    heading: "Technical precision",
    description: "Concise, precise analysis with statutory references and citations.",
    longDescription:
      "Dense, citation-first analysis with precise statutory language and interpretive notes — built to slot straight into your research workflow.",
    starterQuestions: [
      "Elements of free consent under ss. 13–22 of the Contract Act 1872.",
      "Framework for analyzing breach-of-contract remedies.",
      "Jurisdictional limits for specific performance in Pakistan.",
      "How does the Qanun-e-Shahadat treat electronic evidence?",
    ],
  },
};

export const MODE_ORDER: UserMode[] = ["citizen", "student", "lawyer"];

/** Follow-up chips offered under the latest completed response. */
export const FOLLOW_UPS: Record<UserMode, string[]> = {
  citizen: [
    "Explain that in simpler terms",
    "What should I do next?",
    "Show me the exact legal text",
  ],
  student: [
    "Give me an exam-style framework",
    "Compare the related sections",
    "What are common exam traps here?",
  ],
  lawyer: [
    "Cite the relevant statutory text",
    "What are the practical pitfalls?",
    "Any recent amendments?",
  ],
};

export const DISCLAIMER =
  "ADVO provides AI-generated legal information, not legal advice. Please consult a qualified lawyer for important matters.";
