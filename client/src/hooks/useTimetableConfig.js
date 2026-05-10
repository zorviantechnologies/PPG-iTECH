import { useState, useEffect } from 'react';
import api from '../utils/api';

// Default fallback config if API fails or table is empty
const DEFAULT_CONFIG = Array.from({ length: 10 }, (_, i) => ({
    sort_order: i + 1,
    period_number: (i === 3 || i === 6) ? null : (i < 3 ? i + 1 : (i < 6 ? i : i - 1)),
    label: (i === 3 || i === 6) ? 'Break' : `Period ${(i < 3 ? i + 1 : (i < 6 ? i : i - 1))}`,
    start_time: null,
    end_time: null,
    is_break: (i === 3 || i === 6),
}));

let cachedConfig = null; // module-level cache to avoid redundant fetches

export const useTimetableConfig = () => {
    const [config, setConfig] = useState(cachedConfig || DEFAULT_CONFIG);
    const [loading, setLoading] = useState(!cachedConfig);

    useEffect(() => {
        if (cachedConfig) return; // already fetched
        const fetch = async () => {
            try {
                const { data } = await api.get('/timetable/config');
                const resolved = data.length > 0 ? data.sort((a, b) => a.sort_order - b.sort_order) : DEFAULT_CONFIG;
                cachedConfig = resolved;
                setConfig(resolved);
            } catch {
                setConfig(DEFAULT_CONFIG);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    // Periods that are NOT breaks (teachable periods)
    const teachingPeriods = config.filter(p => !p.is_break);

    // Period numbers for grid columns (1, 2, 3...)
    const periodNumbers = teachingPeriods.map(p => p.period_number);

    // All slots including breaks (sorted by sort_order for display)
    const allSlots = config.sort((a, b) => a.sort_order - b.sort_order);

    // Get config for a specific teaching period number
    const getPeriodConfig = (num) => config.find(p => p.period_number === num);

    // Get config for a specific physical position
    const getPositionConfig = (pos) => config.find(p => p.sort_order === pos);

    // Invalidate cache (call after admin saves config)
    const invalidateCache = () => { cachedConfig = null; };

    return { config, teachingPeriods, periodNumbers, allSlots, getPeriodConfig, getPositionConfig, loading, invalidateCache };
};
