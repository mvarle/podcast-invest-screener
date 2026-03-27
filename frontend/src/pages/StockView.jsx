import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStockMentions } from '../lib/api';
import MentionCard from '../components/MentionCard';

export default function StockView() {
  const { ticker } = useParams();
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStockMentions(ticker)
      .then(setMentions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;

  const sentimentCounts = mentions.reduce((acc, m) => {
    acc[m.sentiment] = (acc[m.sentiment] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to Feed</Link>
      <h1>{ticker}</h1>
      {mentions.length > 0 && (
        <p className="stock-subtitle">{mentions[0].company_name}</p>
      )}
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{mentions.length}</span>
          <span className="stat-label">Mentions</span>
        </div>
        <div className="stat">
          <span className="stat-value" style={{ color: '#1a7a1a' }}>{sentimentCounts.bullish || 0}</span>
          <span className="stat-label">Bullish</span>
        </div>
        <div className="stat">
          <span className="stat-value" style={{ color: '#c53030' }}>{sentimentCounts.bearish || 0}</span>
          <span className="stat-label">Bearish</span>
        </div>
        <div className="stat">
          <span className="stat-value" style={{ color: '#856404' }}>{sentimentCounts.hold || 0}</span>
          <span className="stat-label">Hold</span>
        </div>
      </div>
      <div className="mention-grid">
        {mentions.map((mention) => (
          <MentionCard key={mention.id} mention={mention} />
        ))}
      </div>
    </div>
  );
}
