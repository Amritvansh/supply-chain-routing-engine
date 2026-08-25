/**
 * HowItWorks — Week 4: Architecture explanation page
 *
 * Wraps the HowItWorksPanel component in a standard page layout
 * with header and page title. Designed for demo/evaluator audiences.
 */
import HowItWorksPanel from '../components/HowItWorksPanel';

export default function HowItWorks() {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title mb-2">
          How It Works
        </h1>
        <p className="page-subtitle">
          Understanding the hybrid deterministic + AI architecture
        </p>
      </div>

      <HowItWorksPanel />
    </div>
  );
}
