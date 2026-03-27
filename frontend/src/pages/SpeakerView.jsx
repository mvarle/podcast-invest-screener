import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSpeakerMentions } from '../lib/api';
import MentionCard from '../components/MentionCard';

export default function SpeakerView() {
  const { name } = useParams();
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpeakerMentions(name)
      .then(setMentions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [name]);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;

  // Group mentions by ticker to show opinion evolution
  const byTicker = {};
  for (const m of mentions) {
    if (!byTicker[m.ticker]) byTicker[m.ticker] = [];
    byTicker[m.ticker].push(m);
  }

  const correctCount = mentions.reduce((acc, m) => {
    const correct = (m.performance_snapshots || []).filter((s) => s.prediction_correct === true).length;
    return acc + (correct > 0 ? 1 : 0);
  }, 0);

  const scoredCount = mentions.filter(
    (m) => (m.performance_snapshots || []).some((s) => s.prediction_correct !== null)
  ).length;

  return (
    <div className="page">
      <Link to="/speakers" className="back-link">← Back to Speakers</Link>
      <h1>{decodeURIComponent(name)}</h1>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{mentions.length}</span>
          <span className="stat-label">Total Calls</span>
        </div>
        <div className="stat">
          <span className="stat-value">{Object.keys(byTicker).length}</span>
          <span className="stat-label">Stocks Covered</span>
        </div>
        {scoredCount > 0 && (
          <div className="stat">
            <span className="stat-value">{Math.round((correctCount / scoredCount) * 100)}%</span>
            <span className="stat-label">Win Rate ({correctCount}/{scoredCount})</span>
          </div>
        )}
      </div>

      <h2>Opinion Timeline</h2>
      {Object.entries(byTicker).map(([ticker, tickerMentions]) => (
        <div key={ticker} className="ticker-group">
          <h3>
            <Link to={`/stocks/${ticker}`}>{ticker}</Link>
            <span className="ticker-group-count">{tickerMentions.length} mention{tickerMentions.length !== 1 ? 's' : ''}</span>
          </h3>
          <div className="mention-grid">
            {tickerMentions.map((mention) => (
              <MentionCard key={mention.id} mention={mention} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
