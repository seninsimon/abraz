import type { ConnectionStatusProps, ConnectionState } from '../types';

const STATE_CONFIG: Record<ConnectionState, { label: string; colorClass: string }> = {
  new: { label: 'Ready', colorClass: 'status-neutral' },
  connecting: { label: 'Connecting…', colorClass: 'status-warning' },
  connected: { label: 'Connected', colorClass: 'status-success' },
  disconnected: { label: 'Disconnected', colorClass: 'status-error' },
  failed: { label: 'Failed', colorClass: 'status-error' },
  closed: { label: 'Closed', colorClass: 'status-neutral' },
};

export function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  const config = STATE_CONFIG[state];
  const isAnimating = state === 'connecting';

  return (
    <div className={`connection-status ${className}`}>
      <div className={`status-dot ${config.colorClass} ${isAnimating ? 'status-pulse' : ''}`} />
      <span className="status-label">{config.label}</span>
    </div>
  );
}
