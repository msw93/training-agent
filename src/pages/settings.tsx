export default function Settings() {
  return (
    <div className="max-w-xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="bg-white shadow p-6 rounded">
        <h2 className="font-semibold mb-2">User Preferences (Coming Soon)</h2>
        <ul className="list-disc list-inside text-gray-800">
          <li>Commute days</li>
          <li>Hours allowed for sessions</li>
          <li>Primary calendar blocks/keywords to avoid</li>
          <li>Pool/holiday API tokens & region</li>
        </ul>
        <p className="mt-4 text-sm text-gray-500">[Settings controls and user profile integration coming soon.]</p>
      </div>
    </div>
  );
}
