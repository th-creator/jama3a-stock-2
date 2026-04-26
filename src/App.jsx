import { useState } from 'react'

import MainLayout from './layout/MainLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Categories from './pages/Categories.jsx'
import ItemMovements from './pages/ItemMovements.jsx'
import Inventory from './pages/Inventory.jsx'
import Login from './pages/Login.jsx'
import Reports from './pages/Reports.jsx'

const inventoryPages = {
  meteriel: 'meteriel',
  ferronnerie: 'ferronnerie',
  peinture: 'peinture',
  electrique: 'electrique',
  achat: 'achat',
  produit: 'produit',
  signalisation: 'signalisation',
  'petit-materiel': 'petit-materiel',
  technique: 'technique',
}

const pageTitles = {
  dashboard: 'Tableau de bord',
  meteriel: 'Matériel',
  ferronnerie: 'Ferronnerie',
  peinture: 'Peinture',
  electrique: 'Électrique',
  achat: 'Achats',
  produit: 'Produits',
  signalisation: 'Signalisation',
  'petit-materiel': 'Petit matériel',
  technique: 'Technique',
  categories: 'Catégories',
  reports: 'Rapports',
  'item-movements': 'Sorties du produit',
}

function App() {
  const [user, setUser] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [returnPage, setReturnPage] = useState('meteriel')

  function handleLoginSuccess(authenticatedUser) {
    setUser(authenticatedUser)
    setActivePage('dashboard')
  }

  function handleLogout() {
    setUser(null)
    setActivePage('dashboard')
    setSelectedItemId(null)
  }

  function handleOpenItemMovements(itemId, pageId = activePage) {
    setSelectedItemId(itemId)
    setReturnPage(pageId)
    setActivePage('item-movements')
  }

  function renderCurrentPage() {
    if (inventoryPages[activePage]) {
      return (
        <Inventory
          key={activePage}
          sectionType={inventoryPages[activePage]}
          onOpenItemMovements={(itemId) => handleOpenItemMovements(itemId, activePage)}
        />
      )
    }

    if (activePage === 'categories') {
      return <Categories />
    }

    if (activePage === 'reports') {
      return <Reports />
    }

    if (activePage === 'item-movements' && selectedItemId !== null) {
      return (
        <ItemMovements
          itemId={selectedItemId}
          onBack={() => setActivePage(returnPage)}
        />
      )
    }

    return <Dashboard user={user} onOpenItemMovements={handleOpenItemMovements} />
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <MainLayout
      user={user}
      activePage={activePage}
      pageTitle={pageTitles[activePage]}
      onNavigate={setActivePage}
      onLogout={handleLogout}
    >
      {renderCurrentPage()}
    </MainLayout>
  )
}

export default App
