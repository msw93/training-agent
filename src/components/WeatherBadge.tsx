import React from 'react';
import { WeatherForecast } from '@/lib/api';

interface WeatherBadgeProps {
  weather: WeatherForecast | null;
  className?: string;
}

export default function WeatherBadge({ weather, className = '' }: WeatherBadgeProps) {
  if (!weather) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-600 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        No forecast
      </span>
    );
  }

  if (!weather.isOutdoor) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-100 text-blue-700 ${className}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        Indoor
      </span>
    );
  }

  const isBad = weather.isBadWeather;
  const bgColor = isBad ? 'bg-red-100' : 'bg-green-100';
  const textColor = isBad ? 'text-red-700' : 'text-green-700';
  const borderColor = isBad ? 'border-red-300' : 'border-green-300';

  // Get weather icon URL (Open-Meteo uses same icon codes as OpenWeatherMap for compatibility)
  const iconUrl = `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${bgColor} ${textColor} ${borderColor} ${className}`}>
      <img 
        src={iconUrl} 
        alt={weather.description}
        className="w-6 h-6"
        onError={(e) => {
          // Fallback to emoji if image fails
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <div className="flex flex-col">
        <div className="font-semibold">{Math.round(weather.temperature)}°C</div>
        {weather.precipitation > 0 && (
          <div className="text-xs opacity-75">💧 {weather.precipitation.toFixed(1)}mm</div>
        )}
      </div>
      {isBad && (
        <div className="flex items-center gap-1 text-red-600 font-semibold">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Bad
        </div>
      )}
      {weather.recommendation === 'indoor_alternative' && (
        <span className="text-xs italic opacity-75">→ Indoor?</span>
      )}
    </div>
  );
}

