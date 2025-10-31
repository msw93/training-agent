import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-transparent">
            Training & Calendar Coach
          </h1>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed">
            Your endurance training planner, automatically balanced against work and life—safer, smarter, and always up to date.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 mb-8 border border-indigo-100">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">MVP Features</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg">
              <div className="text-2xl">🚴</div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Auto-plan & Manage</h3>
                <p className="text-sm text-gray-600">Weekly workouts with smart scheduling</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg">
              <div className="text-2xl">📅</div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Conflict Handling</h3>
                <p className="text-sm text-gray-600">Smart primary calendar integration</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <div className="text-2xl">✅</div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Approval Flow</h3>
                <p className="text-sm text-gray-600">Weekly approval and summary</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg">
              <div className="text-2xl">📊</div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Stats & Safety</h3>
                <p className="text-sm text-gray-600">Workout stats, tips, guardrails</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/plan-week" 
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 text-center"
          >
            Plan Next Week 🎯
          </Link>
          <Link 
            href="/approvals" 
            className="bg-gradient-to-r from-cyan-600 to-teal-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 text-center"
          >
            Approval Queue 📋
          </Link>
          <Link 
            href="/settings" 
            className="bg-gradient-to-r from-gray-600 to-gray-700 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 text-center"
          >
            Settings ⚙️
          </Link>
        </nav>
      </div>
    </div>
  );
}
