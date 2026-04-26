import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import TablePagination from '@/components/TablePagination.jsx'
import { getInventorySectionLabel, inventorySections } from '@/lib/inventory-sections'

function getDashboardApi() {
  if (typeof window === 'undefined') {
    return null
  }

  return {
    dashboard: window.api?.dashboard ?? null,
    categories: window.api?.categories ?? null,
  }
}

function Dashboard({ user, onOpenItemMovements }) {
  const pageSize = 8
  const api = getDashboardApi()
  const apiUnavailable = !api?.dashboard || !api?.categories
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [selectedSection, setSelectedSection] = useState('all')
  const [lowStockPage, setLowStockPage] = useState(1)
  const [mostUsedPage, setMostUsedPage] = useState(1)

  const categoriesQuery = useQuery({
    queryKey: ['dashboard', 'categories'],
    queryFn: () => {
      if (!api?.categories) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.categories.list({ type: 'all' })
    },
    enabled: !apiUnavailable,
  })

  const itemsQuery = useQuery({
    queryKey: ['dashboard', 'items-count', selectedSection],
    queryFn: () => {
      if (!window.api?.items) {
        throw new Error('Interface Electron indisponible.')
      }

      return window.api.items.list({ type: selectedSection === 'all' ? '' : selectedSection })
    },
    enabled: !apiUnavailable,
  })

  const lowStockQuery = useQuery({
    queryKey: ['dashboard', 'low-stock', selectedSection],
    queryFn: () => {
      if (!api?.dashboard) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.dashboard.lowStock({
        type: selectedSection === 'all' ? '' : selectedSection,
      })
    },
    enabled: !apiUnavailable,
  })

  const mostUsedQuery = useQuery({
    queryKey: ['dashboard', 'most-used', selectedCategoryId, selectedSection],
    queryFn: () => {
      if (!api?.dashboard) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.dashboard.mostUsed({
        months: 3,
        type: selectedSection === 'all' ? '' : selectedSection,
        categoryId: selectedCategoryId === 'all' ? null : Number(selectedCategoryId),
      })
    },
    enabled: !apiUnavailable,
  })

  const lastMonthMovementsQuery = useQuery({
    queryKey: ['dashboard', 'most-used-last-month', selectedSection],
    queryFn: () => {
      if (!api?.dashboard) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.dashboard.mostUsed({
        months: 1,
        type: selectedSection === 'all' ? '' : selectedSection,
      })
    },
    enabled: !apiUnavailable,
  })

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const allItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const lowStockItems = useMemo(() => lowStockQuery.data ?? [], [lowStockQuery.data])
  const mostUsedItems = useMemo(() => mostUsedQuery.data ?? [], [mostUsedQuery.data])
  const lastMonthMovements = useMemo(
    () => lastMonthMovementsQuery.data ?? [],
    [lastMonthMovementsQuery.data],
  )
  const errorMessage =
    categoriesQuery.error?.message ||
    itemsQuery.error?.message ||
    lowStockQuery.error?.message ||
    mostUsedQuery.error?.message ||
    lastMonthMovementsQuery.error?.message

  const lowStockPageCount = Math.max(1, Math.ceil(lowStockItems.length / pageSize))
  const mostUsedPageCount = Math.max(1, Math.ceil(mostUsedItems.length / pageSize))
  const currentLowStockPage = Math.min(lowStockPage, lowStockPageCount)
  const currentMostUsedPage = Math.min(mostUsedPage, mostUsedPageCount)
  const paginatedLowStockItems = useMemo(
    () => lowStockItems.slice((currentLowStockPage - 1) * pageSize, currentLowStockPage * pageSize),
    [lowStockItems, currentLowStockPage],
  )
  const paginatedMostUsedItems = useMemo(
    () => mostUsedItems.slice((currentMostUsedPage - 1) * pageSize, currentMostUsedPage * pageSize),
    [mostUsedItems, currentMostUsedPage],
  )

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bonjour {user.username}, voici un aperçu rapide du stock faible et des sorties récentes.
        </p>
      </div>

      {apiUnavailable ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">
            Interface Electron indisponible. Ouvrez l&apos;application bureau pour afficher le tableau de bord.
          </CardContent>
        </Card>
      ) : null}

      {errorMessage ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">{errorMessage}</CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Pilotage rapide</CardTitle>
            <CardDescription>Choisissez une section et affinez les données affichées sur le tableau de bord.</CardDescription>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[220px_260px]">
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Toutes les sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sections</SelectItem>
                  {inventorySections.map((section) => (
                    <SelectItem key={section.value} value={section.value}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Toutes les catégories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-6">
        <Card className="border border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Stock faible</CardTitle>
            <CardDescription>Articles dont le reste est inférieur ou égal au seuil défini sur la fiche article. Cliquez sur une ligne pour ouvrir les sorties.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Inventaire</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Seuil</TableHead>
                  <TableHead>Reste</TableHead>
                  <TableHead className="text-right">Accès</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockQuery.isLoading ? (
                  <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Chargement du stock faible...
                      </TableCell>
                  </TableRow>
                ) : lowStockItems.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Aucun article en stock faible.
                      </TableCell>
                  </TableRow>
                ) : (
                  paginatedLowStockItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => onOpenItemMovements(item.id)}
                    >
                      <TableCell className="font-medium">{item.name ?? '-'}</TableCell>
                      <TableCell className="font-medium">{item.designation}</TableCell>
                      <TableCell>{item.num_inventaire}</TableCell>
                      <TableCell>{getInventorySectionLabel(item.type)}</TableCell>
                      <TableCell>{item.categoryName ?? 'Sans catégorie'}</TableCell>
                      <TableCell>{item.low_stock_threshold ?? '-'}</TableCell>
                      <TableCell className="font-semibold text-destructive">{item.rest}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={(event) => {
                          event.stopPropagation()
                          onOpenItemMovements(item.id)
                        }}>
                          Ouvrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={currentLowStockPage}
              pageCount={lowStockPageCount}
              totalItems={lowStockItems.length}
              pageSize={pageSize}
              onPageChange={(nextPage) => setLowStockPage(Math.max(1, Math.min(nextPage, lowStockPageCount)))}
            />
          </CardContent>
        </Card>

        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Produits les plus utilisés</CardTitle>
              <CardDescription>Sorties des trois derniers mois, filtrables par catégorie. Cliquez sur une ligne pour ouvrir les sorties.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Inventaire</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Total sorti</TableHead>
                  <TableHead className="text-right">Accès</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostUsedQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Chargement des sorties...
                    </TableCell>
                  </TableRow>
                ) : mostUsedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Aucune sortie enregistrée sur les trois derniers mois.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMostUsedItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => onOpenItemMovements(item.id)}
                    >
                      <TableCell className="font-medium">{item.name ?? '-'}</TableCell>
                      <TableCell className="font-medium">{item.designation}</TableCell>
                      <TableCell>{item.num_inventaire}</TableCell>
                      <TableCell>{getInventorySectionLabel(item.type)}</TableCell>
                      <TableCell>{item.categoryName ?? 'Sans catégorie'}</TableCell>
                      <TableCell>{item.totalUsed}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={(event) => {
                          event.stopPropagation()
                          onOpenItemMovements(item.id)
                        }}>
                          Ouvrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={currentMostUsedPage}
              pageCount={mostUsedPageCount}
              totalItems={mostUsedItems.length}
              pageSize={pageSize}
              onPageChange={(nextPage) => setMostUsedPage(Math.max(1, Math.min(nextPage, mostUsedPageCount)))}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

export default Dashboard
