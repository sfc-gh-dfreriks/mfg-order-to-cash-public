import { Sparkles } from 'lucide-react';
import AskCortex from '@/components/AskCortex';
import ASK_TOPICS from '@/ask_topics.json';

const SUGGESTIONS = ASK_TOPICS.askCortexPage.suggestions;

export default function AskCortexPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/60 via-white to-sky-50/60 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
          <Sparkles className="h-4 w-4" /> Cortex order-to-cash analysis
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Ask a question across orders, fulfillment and OTIF, billing, receivables and DSO, disputes and cash application. Cortex answers from live facts in the gold marts.</p>
      </div>
      <AskCortex topic="general" label="Analyse order-to-cash performance" suggestions={SUGGESTIONS} />
    </div>
  );
}
