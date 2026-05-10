/**
 * Converts HH:mm or HH:mm:ss format to 12-hour AM/PM format
 * @param {string} timeString - Format "HH:mm" or "HH:mm:ss"
 * @returns {string} - Format "hh:mm AM/PM"
 */
export const formatTo12Hr = (timeString) => {
    if (!timeString || timeString === '—' || timeString === '--:--' || timeString === '00:00:00') return '—';
    
    // Handle cases like "09:00 - 10:00"
    if (timeString.includes('-')) {
        return timeString.split('-').map(t => formatTo12Hr(t.trim())).join(' - ');
    }

    try {
        // Simple manual parsing to avoid timezone issues with new Date()
        let [hours, minutes] = timeString.split(':');
        hours = parseInt(hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    } catch (e) {
        return timeString;
    }
};

/**
 * Formats a JS Date or ISO string to a friendly 12-hour timestamp
 */
export const formatTimestamp = (dateInput) => {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
};
