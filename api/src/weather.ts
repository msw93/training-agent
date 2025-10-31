// Weather integration for outdoor workouts

interface WeatherForecast {
  date: string; // ISO date string
  temperature: number; // Celsius
  condition: string; // "clear", "clouds", "rain", "snow", "thunderstorm", etc.
  description: string; // Human-readable description
  icon: string; // Weather icon code
  precipitation: number; // mm of rain/snow
  windSpeed: number; // m/s
  isOutdoor: boolean; // Whether this workout should be checked for weather
  isBadWeather: boolean; // Whether weather is unsuitable for outdoor workout
  recommendation?: 'proceed' | 'reschedule' | 'indoor_alternative';
}

interface OpenMeteoResponse {
  hourly: {
    time: string[]; // ISO date strings
    temperature_2m: number[]; // Celsius
    precipitation: number[]; // mm
    weathercode: number[]; // WMO weather code
    windspeed_10m: number[]; // m/s
  };
}

// Map Open-Meteo coordinates for common cities (fallback if geocoding fails)
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'toronto,ca': { lat: 43.6532, lon: -79.3832 },
  'toronto,canada': { lat: 43.6532, lon: -79.3832 },
};

// WMO Weather Code mapping (Open-Meteo uses WMO codes)
// https://open-meteo.com/en/docs
const WMO_WEATHER_CODES: Record<number, { condition: string; description: string; icon: string }> = {
  0: { condition: 'clear', description: 'Clear sky', icon: '01d' },
  1: { condition: 'clear', description: 'Mainly clear', icon: '01d' },
  2: { condition: 'clouds', description: 'Partly cloudy', icon: '02d' },
  3: { condition: 'clouds', description: 'Overcast', icon: '03d' },
  45: { condition: 'fog', description: 'Foggy', icon: '50d' },
  48: { condition: 'fog', description: 'Depositing rime fog', icon: '50d' },
  51: { condition: 'drizzle', description: 'Light drizzle', icon: '09d' },
  53: { condition: 'drizzle', description: 'Moderate drizzle', icon: '09d' },
  55: { condition: 'drizzle', description: 'Dense drizzle', icon: '09d' },
  56: { condition: 'drizzle', description: 'Light freezing drizzle', icon: '09d' },
  57: { condition: 'drizzle', description: 'Dense freezing drizzle', icon: '09d' },
  61: { condition: 'rain', description: 'Slight rain', icon: '10d' },
  63: { condition: 'rain', description: 'Moderate rain', icon: '10d' },
  65: { condition: 'rain', description: 'Heavy rain', icon: '10d' },
  66: { condition: 'rain', description: 'Light freezing rain', icon: '10d' },
  67: { condition: 'rain', description: 'Heavy freezing rain', icon: '10d' },
  71: { condition: 'snow', description: 'Slight snow fall', icon: '13d' },
  73: { condition: 'snow', description: 'Moderate snow fall', icon: '13d' },
  75: { condition: 'snow', description: 'Heavy snow fall', icon: '13d' },
  77: { condition: 'snow', description: 'Snow grains', icon: '13d' },
  80: { condition: 'rain', description: 'Slight rain showers', icon: '10d' },
  81: { condition: 'rain', description: 'Moderate rain showers', icon: '10d' },
  82: { condition: 'rain', description: 'Violent rain showers', icon: '10d' },
  85: { condition: 'snow', description: 'Slight snow showers', icon: '13d' },
  86: { condition: 'snow', description: 'Heavy snow showers', icon: '13d' },
  95: { condition: 'thunderstorm', description: 'Thunderstorm', icon: '11d' },
  96: { condition: 'thunderstorm', description: 'Thunderstorm with slight hail', icon: '11d' },
  99: { condition: 'thunderstorm', description: 'Thunderstorm with heavy hail', icon: '11d' },
};

// Determine if a workout is outdoor based on title and description
export function isOutdoorWorkout(title: string, description: string = ''): boolean {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;
  
  // Indoor indicators - if any found, it's indoor
  const indoorKeywords = [
    'indoor',
    'trainer',
    'zwift',
    'treadmill',
    'pool', // Swimming is always indoor
    'turbo',
    'stationary'
  ];
  
  if (indoorKeywords.some(keyword => combined.includes(keyword))) {
    return false;
  }
  
  // Outdoor indicators - if it's a run or ride and not explicitly indoor
  const outdoorKeywords = ['run', 'ride', 'bike', 'cycling'];
  const isRunOrRide = outdoorKeywords.some(keyword => titleLower.includes(keyword));
  
  // Swimming is always indoor (pool)
  if (titleLower.includes('swim')) {
    return false;
  }
  
  return isRunOrRide;
}

// Determine if weather is bad for outdoor workouts
function isBadWeather(
  condition: string,
  precipitation: number,
  windSpeed: number,
  temperature: number
): boolean {
  const conditionLower = condition.toLowerCase();
  
  // Bad weather conditions
  const badConditions = ['rain', 'snow', 'thunderstorm', 'drizzle', 'sleet'];
  if (badConditions.some(bad => conditionLower.includes(bad))) {
    return true;
  }
  
  // Heavy precipitation (> 5mm in 3 hours suggests sustained rain)
  if (precipitation > 5) {
    return true;
  }
  
  // Very high winds (> 15 m/s or ~35 mph)
  if (windSpeed > 15) {
    return true;
  }
  
  // Extreme cold (< -10°C) or extreme heat (> 35°C) - adjust based on preference
  if (temperature < -10 || temperature > 35) {
    return true;
  }
  
  return false;
}

// Get weather recommendation
function getWeatherRecommendation(weather: WeatherForecast): 'proceed' | 'reschedule' | 'indoor_alternative' {
  if (!weather.isBadWeather) {
    return 'proceed';
  }
  
  // For runs, suggest indoor alternative (treadmill)
  // For rides, suggest indoor alternative (trainer/Zwift)
  if (weather.isOutdoor) {
    return 'indoor_alternative';
  }
  
  return 'reschedule';
}

// Get coordinates from city name (simple lookup, can be enhanced with geocoding API)
async function getCoordinates(location: string): Promise<{ lat: number; lon: number } | null> {
  // Try direct lookup first
  const locationKey = location.toLowerCase().trim();
  if (CITY_COORDINATES[locationKey]) {
    return CITY_COORDINATES[locationKey];
  }
  
  // Try Open-Meteo geocoding API (free, no key needed)
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geoResponse = await fetch(geoUrl);
    if (geoResponse.ok) {
      const geoData = await geoResponse.json();
      if (geoData.results && geoData.results.length > 0) {
        const result = geoData.results[0];
        return { lat: result.latitude, lon: result.longitude };
      }
    }
  } catch (error) {
    console.warn(`[Weather] Geocoding failed for ${location}, using Toronto default`);
  }
  
  // Fallback to Toronto
  return CITY_COORDINATES['toronto'];
}

// Fetch weather forecast from Open-Meteo (free, no API key required)
export async function fetchWeatherForecast(
  date: string, // ISO date string
  location: string = 'Toronto,CA' // Default to Toronto
): Promise<WeatherForecast | null> {
  try {
    const dateObj = new Date(date);
    const targetDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const targetHour = dateObj.getHours();
    
    // Get coordinates for location
    const coords = await getCoordinates(location);
    if (!coords) {
      console.warn(`[Weather] Could not get coordinates for ${location}`);
      return null;
    }
    
    // Open-Meteo forecast API (hourly, 7 days ahead)
    // Returns hourly data for the next 7 days
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,precipitation,weathercode,windspeed_10m&timezone=auto&forecast_days=7`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Weather] API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data: OpenMeteoResponse = await response.json();
    
    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      console.warn('[Weather] No forecast data returned');
      return null;
    }
    
    // Find the forecast closest to our target date/time
    let closestIndex = 0;
    let minDiff = Infinity;
    
    for (let i = 0; i < data.hourly.time.length; i++) {
      const forecastTime = new Date(data.hourly.time[i]);
      const diff = Math.abs(forecastTime.getTime() - dateObj.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    // Only use forecast if it's within 3 hours of target time
    if (minDiff > 3 * 3600 * 1000) {
      console.warn(`[Weather] No forecast within 3 hours for ${date} (closest was ${Math.round(minDiff / (3600 * 1000))} hours away)`);
      return null;
    }
    
    const temp = data.hourly.temperature_2m[closestIndex];
    const precipitation = data.hourly.precipitation[closestIndex] || 0;
    const weathercode = data.hourly.weathercode[closestIndex];
    const windSpeed = data.hourly.windspeed_10m[closestIndex] || 0;
    
    // Map weather code to condition
    const weatherInfo = WMO_WEATHER_CODES[weathercode] || {
      condition: 'unknown',
      description: 'Unknown weather',
      icon: '01d'
    };
    
    const isBad = isBadWeather(weatherInfo.condition, precipitation, windSpeed, temp);
    
    return {
      date,
      temperature: temp,
      condition: weatherInfo.condition,
      description: weatherInfo.description,
      icon: weatherInfo.icon,
      precipitation,
      windSpeed,
      isOutdoor: false, // Will be set by caller
      isBadWeather: isBad,
      recommendation: isBad ? 'indoor_alternative' : 'proceed'
    };
  } catch (error: any) {
    console.error('[Weather] Error fetching forecast:', error.message);
    return null;
  }
}

// Check weather for a workout event
export async function checkWorkoutWeather(
  title: string,
  description: string,
  startDate: string // ISO date string
): Promise<WeatherForecast | null> {
  const isOutdoor = isOutdoorWorkout(title, description);
  
  if (!isOutdoor) {
    // Not an outdoor workout, no need to check weather
    return {
      date: startDate,
      temperature: 0,
      condition: 'indoor',
      description: 'Indoor workout',
      icon: '01d',
      precipitation: 0,
      windSpeed: 0,
      isOutdoor: false,
      isBadWeather: false,
      recommendation: 'proceed'
    };
  }
  
  const location = process.env.WEATHER_LOCATION || 'Toronto,CA';
  const forecast = await fetchWeatherForecast(startDate, location);
  
  if (!forecast) {
    return null;
  }
  
  return {
    ...forecast,
    isOutdoor: true
  };
}

// Batch check weather for multiple workouts
export async function checkWorkoutsWeather(
  workouts: Array<{ title: string; description: string; start_local: string }>
): Promise<Map<string, WeatherForecast>> {
  const results = new Map<string, WeatherForecast>();
  
  // Group by date to minimize API calls (Open-Meteo is free but still good practice)
  const workoutsByDate = new Map<string, Array<{ title: string; description: string; start_local: string }>>();
  
  for (const workout of workouts) {
    const date = workout.start_local.split('T')[0];
    if (!workoutsByDate.has(date)) {
      workoutsByDate.set(date, []);
    }
    workoutsByDate.get(date)!.push(workout);
  }
  
  // Check weather for each unique date
  const weatherCache = new Map<string, WeatherForecast | null>();
  
  // Check weather for each workout (batch by date for efficiency, but fetch per workout time)
  for (const workout of workouts) {
    const isOutdoor = isOutdoorWorkout(workout.title, workout.description);
    
    if (!isOutdoor) {
      // Indoor workout - no weather needed
      results.set(workout.start_local, {
        date: workout.start_local,
        temperature: 0,
        condition: 'indoor',
        description: 'Indoor workout',
        icon: '01d',
        precipitation: 0,
        windSpeed: 0,
        isOutdoor: false,
        isBadWeather: false,
        recommendation: 'proceed'
      });
    } else {
      // Outdoor workout - fetch weather for specific time
      const forecast = await fetchWeatherForecast(workout.start_local);
      if (forecast) {
        results.set(workout.start_local, {
          ...forecast,
          date: workout.start_local,
          isOutdoor: true,
          recommendation: getWeatherRecommendation({
            ...forecast,
            isOutdoor: true
          })
        });
      }
      // If forecast is null, we'll skip it (no weather data available)
    }
  }
  
  return results;
}

