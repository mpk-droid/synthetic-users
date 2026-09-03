import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '~' },
  { to: '/personas', label: 'Personas', icon: '~' },
  { to: '/journeys', label: 'Journeys', icon: '~' },
  { to: '/environments', label: 'Environments', icon: '~' },
  { to: '/findings', label: 'Findings', icon: '~' },
  { to: '/runs/new', label: 'New Run', icon: '~' },
];

export default function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Synthetic Users</h1>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link${isActive ? ' nav-link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
