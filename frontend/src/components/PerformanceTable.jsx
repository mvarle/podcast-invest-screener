const SNAPSHOT_ORDER = ['1d', '1w', '1m', '3m', '6m', '1y'];
const SNAPSHOT_LABELS = {
  '1d': '1 Day',
  '1w': '1 Week',
  '1m': '1 Month',
  '3m': '3 Months',
  '6m': '6 Months',
  '1y': '1 Year',
};

export default function PerformanceTable({ snapshots, baselinePrice }) {
  if (!snapshots || snapshots.length === 0) {
    return <p className="text-muted">No performance data yet.</p>;
  }

  const snapshotMap = {};
  for (const s of snapshots) {
    snapshotMap[s.snapshot_type] = s;
  }

  return (
    <table className="performance-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Price</th>
          <th>Change</th>
          <th>Correct?</th>
        </tr>
      </thead>
      <tbody>
        <tr className="baseline-row">
          <td>Baseline</td>
          <td>${baselinePrice?.toFixed(2) || '—'}</td>
          <td>—</td>
          <td>—</td>
        </tr>
        {SNAPSHOT_ORDER.map((type) => {
          const snap = snapshotMap[type];
          if (!snap) return null;
          const changeColor = snap.price_change_percent > 0 ? '#1a7a1a' : snap.price_change_percent < 0 ? '#c53030' : '#666';
          return (
            <tr key={type}>
              <td>{SNAPSHOT_LABELS[type]}</td>
              <td>${snap.closing_price.toFixed(2)}</td>
              <td style={{ color: changeColor, fontWeight: 600 }}>
                {snap.price_change_percent > 0 ? '+' : ''}
                {snap.price_change_percent.toFixed(2)}%
              </td>
              <td>
                {snap.prediction_correct === true && <span className="prediction-correct">✓</span>}
                {snap.prediction_correct === false && <span className="prediction-wrong">✗</span>}
                {snap.prediction_correct === null && '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
