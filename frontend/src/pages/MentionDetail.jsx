import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMention } from '../lib/api';
import PerformanceTable from '../components/PerformanceTable';

const SENTIMENT_COLORS = {
  bullish: { bg: '#e6f9e6', color: '#1a7a1a', label: 'Bullish' },
  bearish: { bg: '#fde8e8', color: '#c53030', label: 'Bearish' },
  hold: { bg: '#fef3cd', color: '#856404', label: 'Hold' },
};

export default function MentionDetail() {
  const { id } = useParams();
  const [mention, setMention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMention(id)
      .then(setMention)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page"><p className="loading">Loading...</p></div>;
  if (error) return <div className="page"><p className="error">Error: {error}</p></div>;
  if (!mention) return <div className="page"><p>Mention not found.</p></div>;

  const sentiment = SENTIMENT_COLORS[mention.sentiment] || SENTIMENT_COLORS.hold;
  const episode = mention.episodes;

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to Feed</Link>
      <div className="detail-header">
        <div>
          <h1>
            <Link to={`/stocks/${mention.ticker}`}>{mention.ticker}</Link>
            {' '}<span className="detail-company">{mention.company_name}</span>
          </h1>
          <span
            className="sentiment-badge sentiment-badge-lg"
            style={{ backgroundColor: sentiment.bg, color: sentiment.color }}
          >
            {sentiment.label}
          </span>
        </div>
      </div>

      <section className="detail-section">
        <h2>Quote</h2>
        <blockquote className="detail-quote">"{mention.quote}"</blockquote>
      </section>

      {mention.reasoning && (
        <section className="detail-section">
          <h2>Reasoning</h2>
          <p>{mention.reasoning}</p>
        </section>
      )}

      <section className="detail-section">
        <h2>Context</h2>
        <div className="detail-meta">
          {mention.speaker && (
            <p>
              <strong>Speaker:</strong>{' '}
              <Link to={`/speakers/${encodeURIComponent(mention.speaker)}`}>{mention.speaker}</Link>
            </p>
          )}
          {episode && (
            <p>
              <strong>Episode:</strong>{' '}
              <Link to={`/episodes/${episode.id}`}>{episode.title}</Link>
            </p>
          )}
          {episode?.release_date && (
            <p><strong>Date:</strong> {new Date(episode.release_date).toLocaleDateString()}</p>
          )}
          {mention.timestamp_in_transcript && (
            <p><strong>Position:</strong> {mention.timestamp_in_transcript}</p>
          )}
        </div>
      </section>

      <section className="detail-section">
        <h2>Performance Tracking</h2>
        <PerformanceTable
          snapshots={mention.performance_snapshots}
          baselinePrice={mention.baseline_price}
        />
      </section>
    </div>
  );
}
