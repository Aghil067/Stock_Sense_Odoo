import { useAuth } from '../auth-context';
import { PageHeader } from '../components/app-shell';

export function ProfilePage() {
  const { user } = useAuth();
  return <>
    <PageHeader eyebrow="Account" title="My profile" description="Your identity and access in this inventory workspace." />
    <section className="panel profile-panel profile-page-card">
      <div className="profile-large">
        <div className="avatar large">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
        <h2>{user?.name}</h2>
        <p>{user?.email}</p>
        <span>{user?.role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'}</span>
      </div>
      <div className="metadata-list"><div><span>Account type</span><strong>{user?.role === 'MANAGER' ? 'Inventory management' : 'Warehouse operations'}</strong></div><div><span>Access</span><strong>{user?.role === 'MANAGER' ? 'Catalog and configuration' : 'Stock operations'}</strong></div></div>
    </section>
  </>;
}
