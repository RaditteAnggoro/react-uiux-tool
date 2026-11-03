import { useState } from 'react';
import Button from './Button';

const projects = [
  { name: 'Website redesign', team: 'Design', progress: 'In progress', initials: 'WR', color: 'violet' },
  { name: 'Customer portal', team: 'Engineering', progress: 'In review', initials: 'CP', color: 'blue' },
  { name: 'Brand guidelines', team: 'Design', progress: 'Completed', initials: 'BG', color: 'orange' },
];

export default function App() {
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  return <div className="demo-app">
    <header className="app-header">
      <a className="app-brand" href="#overview"><span className="brand-mark">a</span>acme<span className="workspace-label">Workspace</span></a>
      <nav aria-label="Workspace"><a className="active" href="#overview">Overview</a><a href="#projects">Projects</a><a href="#activity">Activity</a></nav>
      <span className="user-avatar" aria-label="Demo user">JD</span>
    </header>
    <main className="app-main">
      <section className="welcome-section" id="overview">
        <div><div className="eyebrow">YOUR WORKSPACE, AT A GLANCE</div><h1>Good morning, Jordan <span className="greeting-dot">✳</span></h1><p>Here’s what’s happening with your projects today.</p></div>
        <button type="button" className="primary-button" title="Create project" onClick={() => setNotice('Example action only — no backend was called.')}>Create project</button>
      </section>
      {notice && <p className="notice" role="status">{notice}</p>}
      <section className="stats-grid" aria-label="Project summary">
        <article className="stat-card"><div className="stat-heading"><span>Total projects</span><span className="stat-icon">▧</span></div><strong>24</strong><p><span className="positive">↗ 12%</span> vs. last month</p></article>
        <article className="stat-card"><div className="stat-heading"><span>In progress</span><span className="stat-icon">◷</span></div><strong>8</strong><p><span className="stat-description">Across 3 teams</span></p></article>
        <article className="stat-card"><div className="stat-heading"><span>Completed</span><span className="stat-icon">☑</span></div><strong>16</strong><p><span className="positive">↗ 4 projects</span> this month</p></article>
      </section>
      <section className="projects-section" id="projects">
        <div className="section-heading"><div><h2>Recent projects</h2><p>A little progress, every day.</p></div><Button variant="secondary" onClick={() => setNotice('All local example projects are shown below.')}>View all projects</Button></div>
        <div className="table-toolbar"><label><span>⌕</span><input aria-label="Search projects" placeholder="Search projects…" value={search} onChange={event => setSearch(event.target.value)} /></label><span className="table-note">Local example data</span></div>
        <table><thead><tr><th>Project name</th><th>Team</th><th>Status</th><th>Members</th></tr></thead><tbody>
          {projects.filter(project => project.name.toLowerCase().includes(search.toLowerCase())).map(project => <tr key={project.name}><td><span className={`project-icon ${project.color}`}>{project.initials}</span><strong>{project.name}</strong></td><td>{project.team}</td><td><span className="status-pill">{project.progress}</span></td><td><span className="tiny-avatar">JD</span><span className="tiny-avatar second">AL</span></td></tr>)}
        </tbody></table>
        <div className="table-footer"><span>3 local example projects · repeated rows are read-only in the visual editor</span><span>← &nbsp; 1 &nbsp; →</span></div>
      </section>
      <section className="help-card" id="activity"><span className="help-icon">◈</span><div><h3>Make this workspace your own.</h3><p>Select the Create project button in Design mode, edit its text, then review the exact source diff.</p></div></section>
    </main>
  </div>;
}
