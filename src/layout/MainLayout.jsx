import { LayoutDashboard, Boxes, PaintBucket, Zap, ShoppingCart, Package, TriangleAlert, Hammer, Wrench, Tags, FileText, LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'

const navigationItems = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    id: 'meteriel',
    label: 'Matériel',
    icon: <Boxes className="size-4" />,
  },
  {
    id: 'ferronnerie',
    label: 'Ferronnerie',
    icon: <Hammer className="size-4" />,
  },
  {
    id: 'peinture',
    label: 'Peinture',
    icon: <PaintBucket className="size-4" />,
  },
  {
    id: 'electrique',
    label: 'Électrique',
    icon: <Zap className="size-4" />,
  },
  {
    id: 'achat',
    label: 'Achats',
    icon: <ShoppingCart className="size-4" />,
  },
  {
    id: 'produit',
    label: 'Produits',
    icon: <Package className="size-4" />,
  },
  {
    id: 'signalisation',
    label: 'Signalisation',
    icon: <TriangleAlert className="size-4" />,
  },
  {
    id: 'petit-materiel',
    label: 'Petit matériel',
    icon: <Boxes className="size-4" />,
  },
  {
    id: 'technique',
    label: 'Technique',
    icon: <Wrench className="size-4" />,
  },
  {
    id: 'categories',
    label: 'Catégories',
    icon: <Tags className="size-4" />,
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: <FileText className="size-4" />,
  },
]

function MainLayout({ user, activePage, pageTitle, onNavigate, onLogout, children }) {
  const highlightedPage = activePage

  return (
    <div className="flex min-h-screen bg-muted/30 text-foreground">
      <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-border bg-background px-4 py-6">
        <div className="space-y-1 border-b border-border pb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Gestion
          </p>
          <h1 className="text-xl font-semibold">Stock bureau</h1>
          <p className="text-sm text-muted-foreground">Connecté en tant que {user.username}</p>
        </div>

        <nav className="mt-6 flex-1 space-y-2 overflow-y-auto pr-1">
          {navigationItems.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={highlightedPage === id ? 'page' : undefined}
              className={[
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                highlightedPage === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <Button type="button" variant="outline" className="mt-6 w-full shrink-0 justify-start" onClick={onLogout}>
          <LogOut className="size-4" />
          Déconnexion
        </Button>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-border bg-background/80 px-8 py-5 backdrop-blur">
          <p className="text-sm text-muted-foreground">Espace principal</p>
          <h2 className="text-2xl font-semibold">{pageTitle}</h2>
        </header>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  )
}

export default MainLayout
