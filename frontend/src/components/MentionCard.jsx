import { Link } from 'react-router-dom';

const SENTIMENT_COLORS = {
  bullish: { bg: '#e6f9e6', color: '#1a7a1a', label: 'Bullish' },
  bearish: { bg: '#fde8e8', color: '#c53030', label: 'Bearish' },
  hold: { bg: '#fef3cd', color: '#856404', label: 'Hold' },
};

export default function MentionCard({ mention }) {
  const sentiment = SENTIMENT_COLORS[mention.sentiment] || SENTIMENT_COLORS.hold;
  const episode = mention.episodes;
  const releaseDate = episode?.release_date
    ? new Date(episode.release_date).toLocaleDateString()
    : '';

  return (
    <div className="mention-card">
      <div className="mention-header">
        <div className="mention-ticker-group">
          <Link to={`/stocks/${mention.ticker}`} className="mention-ticker">
            {mention.ticker}
          </Link>
          <span className="mention-company">{mention.company_name}</span>
        </div>
        <span
          className="sentiment-badge"
          style={{ backgroundColor: sentiment.bg, color: sentiment.color }}
        >
          {sentiment.label}
        </span>
      </div>
      <p className="mention-quote">"{mention.quote}"</p>
      <div className="mention-meta">
        {mention.speaker && (
          <Link to={`/speakers/${encodeURIComponent(mention.speaker)}`} className="mention-speaker">
            {mention.speaker}
          </Link>
        )}
        {episode && (
          <Link to={`/episodes/${episode.id}`} className="mention-episode">
            {episode.title}
          </Link>
        )}
        {releaseDate && <span className="mention-date">{releaseDate}</span>}
      </div>
      {mention.baseline_price && (
        <div className="mention-price">
          Baseline: ${mention.baseline_price.toFixed(2)}
        </div>
      )}
      <Link to={`/mentions/${mention.id}`} className="mention-detail-link">
        View details →
      </Link>
    </div>
  );
}
