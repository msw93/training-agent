import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center py-16">
      <h1 className="text-3xl font-bold mb-4">Training & Calendar Coach</h1>
      <p className="mb-6 max-w-md text-center">
        Your endurance training planner, automatically balanced against work and life—safer, smarter, and always up to date.
      </p>
      <div className="mb-6">
        <h2 className="font-semibold mb-2">MVP Features</h2>
        <ul className="list-disc list-inside text-left">
          <li>Auto-plan & manage weekly workouts</li>
          <li>Smart primary calendar conflict handling</li>
          <li>Weekly approval/summary flow</li>
          <li>Workout stats, fueling tips, safety guardrails</li>
        </ul>
      </div>
      <nav className="flex flex-col gap-3 mt-4">
        <Link href="/plan-week" className="text-blue-600 underline">Plan Next Week</Link>
        <Link href="/approvals" className="text-blue-600 underline">Approval Queue</Link>
        <Link href="/settings" className="text-blue-600 underline">Settings</Link>
      </nav>
    </div>
  );
}
