export const getCurrentDayStatus = ({ today, holidayData = [] }) => {
    const todayIso = today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const todayItems = (holidayData || []).filter(
        (item) => String(item.h_date).slice(0, 10) === todayIso
    );

    const specialToday = todayItems.find(
        (item) => String(item.type || '').toLowerCase() === 'special'
    );
    if (specialToday) {
        return {
            type: 'specialEvents',
            label: 'Special Event',
            detail: specialToday.title || specialToday.name || specialToday.note || 'Special event today'
        };
    }

    const holidayToday = todayItems.find(
        (item) => String(item.type || '').toLowerCase() === 'holiday'
    );

    const dayOfWeek = new Date(`${todayIso}T00:00:00`).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (holidayToday || isWeekend) {
        return {
            type: 'holidays',
            label: 'Holiday',
            detail: holidayToday?.title || holidayToday?.name || (isWeekend ? 'Weekend' : 'Holiday')
        };
    }

    return {
        type: 'workingDays',
        label: 'Working Day',
        detail: 'Regular working day'
    };
};
