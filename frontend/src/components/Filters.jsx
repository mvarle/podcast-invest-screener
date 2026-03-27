import { useState } from 'react';

export default function Filters({ onApply, showSpeaker = true }) {
  const [ticker, setTicker] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onApply({ ticker, sentiment, speaker, from, to });
  }

  function handleClear() {
    setTicker('');
    setSentiment('');
    setSpeaker('');
    setFrom('');
    setTo('');
    onApply({});
  }

  return (
    <form className="filters" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Ticker (e.g. AAPL)"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        className="filter-input"
      />
      <select
        value={sentiment}
        onChange={(e) => setSentiment(e.target.value)}
        className="filter-input"
      >
        <option value="">All Sentiments</option>
        <option value="bullish">Bullish</option>
        <option value="bearish">Bearish</option>
        <option value="hold">Hold</option>
      </select>
      {showSpeaker && (
        <input
          type="text"
          placeholder="Speaker"
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          className="filter-input"
        />
      )}
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="filter-input"
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="filter-input"
      />
      <button type="submit" className="btn btn-primary">Filter</button>
      <button type="button" onClick={handleClear} className="btn">Clear</button>
    </form>
  );
}
