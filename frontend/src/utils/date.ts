export function formatTime(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}
