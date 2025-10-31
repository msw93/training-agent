import React from 'react';
import WeatherBadge from './WeatherBadge';
import { WeatherForecast } from '@/lib/api';

interface EventItem {
  event_id?: string;
  title_short: string;
  start_local: string;
  end_local: string;
  description?: string;
}

interface CalendarWeekViewProps {
  events: EventItem[];
  weatherData?: Record<string, WeatherForecast>;
  onEventClick?: (event: EventItem) => void;
  className?: string;
}

// Extract distance from description
function extractDistance(description: string = ''): string | null {
  // Look for "Distance: X km" or "Distance: X m" patterns
  const kmMatch = description.match(/Distance:\s*(\d+(?:\.\d+)?)\s*km/i);
  if (kmMatch) {
    return `${kmMatch[1]} km`;
  }
  const mMatch = description.match(/Distance:\s*(\d+(?:\.\d+)?)\s*m/i);
  if (mMatch) {
    return `${(parseFloat(mMatch[1]) / 1000).toFixed(1)} km`; // Convert meters to km for display
  }
  return null;
}

// Format title with type and distance
function formatWorkoutTitle(title: string, description: string = ''): string {
  // Determine workout type from title
  const titleLower = title.toLowerCase();
  let workoutType = '';
  if (titleLower.includes('run')) {
    workoutType = 'Run';
  } else if (titleLower.includes('bike') || titleLower.includes('ride') || titleLower.includes('cycling')) {
    workoutType = 'Bike';
  } else if (titleLower.includes('swim')) {
    workoutType = 'Swim';
  } else {
    // Try to infer from description
    const descLower = description.toLowerCase();
    if (descLower.includes('run') && !descLower.includes('swim') && !descLower.includes('bike')) {
      workoutType = 'Run';
    } else if (descLower.includes('bike') || descLower.includes('ride') || descLower.includes('cycling')) {
      workoutType = 'Bike';
    } else if (descLower.includes('swim')) {
      workoutType = 'Swim';
    } else {
      workoutType = title.split('—')[0]?.trim() || title; // Use first part if separated by —
    }
  }
  
  // Extract distance
  const distance = extractDistance(description);
  
  // Build formatted title
  if (distance) {
    return `${workoutType} ${distance}`;
  }
  return workoutType || title;
}

export default function CalendarWeekView({ events, weatherData = {}, onEventClick, className = '' }: CalendarWeekViewProps) {
  // Get next Monday
  const getNextMonday = () => {
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  };

  const monday = getNextMonday();
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Group events by day
  const eventsByDay = new Map<number, EventItem[]>();
  
  weekDays.forEach((_, index) => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + index);
    const dayKey = dayDate.toDateString();
    eventsByDay.set(index, []);
  });

  events.forEach(event => {
    const eventDate = new Date(event.start_local);
    const eventDay = eventDate.getDay();
    // Convert Sunday (0) to 7, then Monday (1) = 1, ..., Friday (5) = 5
    const weekdayIndex = eventDay === 0 ? 7 : eventDay;
    const daysSinceMonday = weekdayIndex - 1; // Monday is 0
    
    if (daysSinceMonday >= 0 && daysSinceMonday < 7) {
      const dayEvents = eventsByDay.get(daysSinceMonday) || [];
      dayEvents.push(event);
      eventsByDay.set(daysSinceMonday, dayEvents);
    }
  });

  // Sort events by start time within each day
  eventsByDay.forEach((dayEvents, dayIndex) => {
    dayEvents.sort((a, b) => {
      const timeA = new Date(a.start_local).getTime();
      const timeB = new Date(b.start_local).getTime();
      return timeA - timeB;
    });
  });

  // Time slots for the day (6 AM to 10 PM) - condensed view, show every 3 hours to save space
  const hours = Array.from({ length: 6 }, (_, i) => i * 3 + 6); // 6 AM, 9 AM, 12 PM, 3 PM, 6 PM, 9 PM
  
  // Each row represents 3 hours, and we use h-6 (24px) per row for a much more compact view
  const rowHeight = 24; // h-6 = 1.5rem = 24px
  const hoursPerRow = 3; // Each row represents 3 hours
  const minutesPerRow = hoursPerRow * 60; // 180 minutes per row

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getEventPosition = (event: EventItem) => {
    const start = new Date(event.start_local);
    const end = new Date(event.end_local);
    const startHour = start.getHours();
    const startMinute = start.getMinutes();
    const endHour = end.getHours();
    const endMinute = end.getMinutes();
    
    // Calculate position from 6 AM
    // Each row is 24px and represents 3 hours (180 minutes)
    const startMinutes = (startHour - 6) * 60 + startMinute;
    const endMinutes = (endHour - 6) * 60 + endMinute;
    const duration = endMinutes - startMinutes;
    
    // Convert minutes to pixels: each row is 24px for 180 minutes, so each minute is 24/180 = 0.133px
    const pixelsPerMinute = rowHeight / minutesPerRow; // 24/180 = 0.133px per minute
    const top = startMinutes * pixelsPerMinute;
    const height = Math.max(duration * pixelsPerMinute, 20); // Minimum 20px height for compact view
    
    return { top, height };
  };

  // Get workout color based on type
  const getWorkoutColor = (title: string, description: string) => {
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    
    if (titleLower.includes('run') || descLower.includes('run')) {
      return 'bg-blue-500 hover:bg-blue-600';
    } else if (titleLower.includes('bike') || titleLower.includes('ride') || titleLower.includes('cycling') || descLower.includes('bike') || descLower.includes('ride')) {
      return 'bg-green-500 hover:bg-green-600';
    } else if (titleLower.includes('swim') || descLower.includes('swim')) {
      return 'bg-cyan-500 hover:bg-cyan-600';
    }
    return 'bg-indigo-500 hover:bg-indigo-600';
  };

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-indigo-100 ${className}`}>
      <div className="p-4">
        <h2 className="text-lg font-bold mb-3 text-gray-800">📅 This Week's Schedule</h2>
        
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '50vh' }}>
          <div className="min-w-[600px]">
            {/* Day headers */}
            <div className="grid grid-cols-8 gap-1 mb-1">
              <div className="text-xs font-semibold text-gray-600">Time</div>
              {weekDays.map((day, index) => {
                const dayDate = new Date(monday);
                dayDate.setDate(monday.getDate() + index);
                return (
                  <div key={index} className="text-center">
                    <div className="text-xs font-semibold text-gray-700">{day.slice(0, 3)}</div>
                    <div className="text-[10px] text-gray-500">{dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </div>
                );
              })}
            </div>

            {/* Calendar grid */}
            <div className="relative border-t border-l border-gray-200">
              {/* Time column and day columns */}
              <div className="grid grid-cols-8 gap-0.5">
                {/* Time labels column - made much smaller */}
                <div className="relative w-12">
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className="border-b border-gray-100 h-6 flex items-start justify-end pr-1"
                      style={{ height: `${rowHeight}px` }}
                    >
                      <span className="text-[7px] text-gray-500 leading-none">
                        {hour === 12 ? '12P' : hour < 12 ? `${hour}A` : `${hour - 12}P`}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {weekDays.map((_, dayIndex) => {
                  const dayDate = new Date(monday);
                  dayDate.setDate(monday.getDate() + dayIndex);
                  const dayEvents = eventsByDay.get(dayIndex) || [];
                  
                  return (
                    <div key={dayIndex} className="relative border-r border-gray-200">
                      {/* Hour markers */}
                      {hours.map(hour => (
                        <div
                          key={hour}
                          className="border-b border-gray-100"
                          style={{ height: `${rowHeight}px` }}
                        />
                      ))}
                      
                      {/* Events */}
                      <div className="absolute inset-0 pointer-events-none">
                        {dayEvents.map((event, eventIdx) => {
                          const { top, height } = getEventPosition(event);
                          const formattedTitle = formatWorkoutTitle(event.title_short, event.description);
                          const colorClass = getWorkoutColor(event.title_short, event.description || '');
                          
                          return (
                            <div
                              key={event.event_id || eventIdx}
                              className={`absolute left-0 right-0 mx-0.5 ${colorClass} text-white rounded-sm shadow-sm px-0.5 py-0.5 text-[8px] font-semibold cursor-pointer pointer-events-auto transition-all hover:shadow-md z-10 overflow-hidden`}
                              style={{
                                top: `${top}px`,
                                height: `${Math.max(height, 20)}px`,
                                minHeight: '20px'
                              }}
                              onClick={() => onEventClick?.(event)}
                            >
                              <div className="flex items-start justify-between gap-0.5 h-full">
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold truncate leading-tight text-[8px]">{formattedTitle}</div>
                                  <div className="text-white/80 text-[7px] mt-0 leading-tight">
                                    {formatTime(new Date(event.start_local)).replace(' ', '').replace(' ', '')}
                                  </div>
                                </div>
                                {weatherData[event.start_local] && weatherData[event.start_local].isBadWeather && (
                                  <div className="shrink-0 text-[6px]">⚠️</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the formatting function for use elsewhere
export { formatWorkoutTitle };


