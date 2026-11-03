import Button from './Button';

export default function Board({ scenario = 'default' }: { scenario?: string }) {
  const loading = scenario === 'loading';
  const failed = scenario === 'error';
  return <main className="board-page">
    <header className="board-header"><span className="eyebrow">COMPONENT PLAYGROUND</span><h1>Button</h1><p>Isolated local fixture · no API calls or production providers</p></header>
    <section className="board-stage" aria-label="Button scenario">
      <Button variant="primary" disabled={loading}>{loading ? 'Creating project…' : failed ? 'Try again' : 'Create project'}</Button>
      {failed && <p className="board-error" role="alert">Example error: the fixture could not complete. No request was made.</p>}
    </section>
    <p className="board-caption">Scenario: {scenario}. Scenario switching affects this Board only and does not modify source code.</p>
  </main>;
}
