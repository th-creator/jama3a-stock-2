import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpDown, ChevronDown, ChevronRight, Eye, FileSpreadsheet, FileText, MoreHorizontal, Pencil, Trash2, Zap } from 'lucide-react'
import * as XLSX from 'xlsx'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
import TablePagination from '@/components/TablePagination.jsx'
import { getInventorySectionLabel, inventorySections } from '@/lib/inventory-sections'

const emptyFormValues = {
  name: '',
  num_order: '',
  num_bon: '',
  num_marche: '',
  num_inventaire: '',
  designation: '',
  providerName: '',
  quantity: '0',
  low_stock_threshold: '',
  date: '',
  type: inventorySections[0].value,
  categoryId: 'none',
}

const emptyQuickExitValues = {
  quantity: '1',
  date: new Date().toISOString().slice(0, 10),
  party: '',
  observations: '',
}

function getInventoryApi() {
  if (typeof window === 'undefined') {
    return null
  }

  return {
    items: window.api?.items ?? null,
    categories: window.api?.categories ?? null,
    movements: window.api?.movements ?? null,
  }
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleDateString('fr-FR')
}

function compareValues(leftValue, rightValue) {
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue
  }

  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'fr', { sensitivity: 'base' })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function Inventory({ sectionType, onOpenItemMovements }) {
  const pageSize = 10
  const queryClient = useQueryClient()
  const api = getInventoryApi()
  const apiUnavailable = !api?.items || !api?.categories || !api?.movements
  const [editingItemId, setEditingItemId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [quickExitItem, setQuickExitItem] = useState(null)
  const [expandedItemId, setExpandedItemId] = useState(null)
  const [actionMenu, setActionMenu] = useState(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' })
  const actionMenuRef = useRef(null)
  const selectedType = sectionType ?? inventorySections[0].value
  const [formValues, setFormValues] = useState({ ...emptyFormValues, type: selectedType })
  const [quickExitValues, setQuickExitValues] = useState(emptyQuickExitValues)

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'inventory', selectedType],
    queryFn: () => {
      if (!api?.categories) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.categories.list({ type: selectedType })
    },
    enabled: !apiUnavailable,
  })

  const itemsQuery = useQuery({
    queryKey: ['items', selectedType, search],
    queryFn: () => {
      if (!api?.items) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.items.list({
        type: selectedType,
        search: search.trim(),
      })
    },
    enabled: !apiUnavailable,
  })

  const recentMovementsQuery = useQuery({
    queryKey: ['movements', 'recent-preview', expandedItemId],
    queryFn: () => {
      if (!api?.movements || expandedItemId === null) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.movements.list({ itemId: expandedItemId })
    },
    enabled: !apiUnavailable && expandedItemId !== null,
  })

  const saveItemMutation = useMutation({
    mutationFn: async () => {
      if (!api?.items) {
        throw new Error('Interface Electron indisponible.')
      }

      const payload = {
        ...formValues,
        categoryId: formValues.categoryId === 'none' ? null : Number(formValues.categoryId),
        low_stock_threshold: formValues.low_stock_threshold === '' ? null : Number(formValues.low_stock_threshold),
        rest: 0,
      }

      if (editingItemId === null) {
        return api.items.create(payload)
      }

      return api.items.update(editingItemId, payload)
    },
    onSuccess: async () => {
      setEditingItemId(null)
      setFormValues({ ...emptyFormValues, type: selectedType })
      setIsFormOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['items'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId) => {
      if (!api?.items) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.items.delete(itemId)
    },
    onSuccess: async () => {
      if (editingItemId !== null) {
        setEditingItemId(null)
        setFormValues({ ...emptyFormValues, type: selectedType })
      }

      setItemToDelete(null)
      if (expandedItemId === itemToDelete?.id) {
        setExpandedItemId(null)
      }

      await queryClient.invalidateQueries({ queryKey: ['items'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const quickExitMutation = useMutation({
    mutationFn: async () => {
      if (!api?.movements || !quickExitItem) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.movements.create({
        item_id: quickExitItem.id,
        quantity: Number(quickExitValues.quantity),
        date: quickExitValues.date,
        party: quickExitValues.party,
        observations: quickExitValues.observations,
      })
    },
    onSuccess: async () => {
      const currentQuickExitItemId = quickExitItem?.id
      setQuickExitItem(null)
      setQuickExitValues(emptyQuickExitValues)
      await queryClient.invalidateQueries({ queryKey: ['items'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      if (currentQuickExitItemId !== null) {
        await queryClient.invalidateQueries({ queryKey: ['movements', currentQuickExitItemId] })
        await queryClient.invalidateQueries({ queryKey: ['movements', 'recent-preview', currentQuickExitItemId] })
      }
    },
  })

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const rawItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const recentMovements = useMemo(
    () => (recentMovementsQuery.data ?? []).slice(0, 3),
    [recentMovementsQuery.data],
  )

  useEffect(() => {
    if (!actionMenu) {
      return undefined
    }

    function handlePointerDown(event) {
      if (actionMenuRef.current?.contains(event.target)) {
        return
      }

      if (!(event.target instanceof Element)) {
        setActionMenu(null)
        return
      }

      const trigger = event.target.closest('[data-action-menu-trigger]')

      if (trigger?.getAttribute('data-action-menu-trigger') === String(actionMenu.itemId)) {
        return
      }

      setActionMenu(null)
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setActionMenu(null)
      }
    }

    function handleViewportChange() {
      setActionMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [actionMenu])

  const displayedItems = useMemo(() => {
    const filteredItems = rawItems.filter((item) => {
      const matchesCategory = selectedCategoryId === 'all' || String(item.categoryId ?? '') === selectedCategoryId
      const matchesLowStock =
        !showLowStockOnly
        || (item.low_stock_threshold !== null && item.low_stock_threshold !== undefined && item.rest <= item.low_stock_threshold)
      return matchesCategory && matchesLowStock
    })

    const sortedItems = [...filteredItems].sort((leftItem, rightItem) => {
      const multiplier = sortConfig.direction === 'asc' ? 1 : -1
      const leftValue = leftItem[sortConfig.key] ?? ''
      const rightValue = rightItem[sortConfig.key] ?? ''
      return compareValues(leftValue, rightValue) * multiplier
    })

    return sortedItems
  }, [rawItems, selectedCategoryId, showLowStockOnly, sortConfig])
  const pageCount = Math.max(1, Math.ceil(displayedItems.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedItems = useMemo(
    () => displayedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [displayedItems, currentPage],
  )

  const quickExitQuantity = Number(quickExitValues.quantity || 0)
  const projectedRest = quickExitItem ? quickExitItem.rest - quickExitQuantity : 0
  const isQuickExitInvalid = !quickExitValues.quantity || quickExitQuantity <= 0 || projectedRest < 0

  const isBusy =
    saveItemMutation.isPending
    || deleteItemMutation.isPending
    || quickExitMutation.isPending
  const errorMessage =
    itemsQuery.error?.message ||
    categoriesQuery.error?.message ||
    recentMovementsQuery.error?.message ||
    saveItemMutation.error?.message ||
    deleteItemMutation.error?.message ||
    quickExitMutation.error?.message

  function handleChange(field, value) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function handleQuickExitChange(field, value) {
    setQuickExitValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function handleSort(key) {
    setSortConfig((currentSortConfig) => {
      if (currentSortConfig.key === key) {
        return {
          key,
          direction: currentSortConfig.direction === 'asc' ? 'desc' : 'asc',
        }
      }

      return { key, direction: 'asc' }
    })
  }

  function handleSubmit(event) {
    event.preventDefault()

    saveItemMutation.mutate()
  }

  function handleQuickExitSubmit(event) {
    event.preventDefault()

    if (isQuickExitInvalid) {
      return
    }

    quickExitMutation.mutate()
  }

  function handleEdit(item) {
    setActionMenu(null)
    setEditingItemId(item.id)
    setFormValues({
      name: item.name ?? '',
      num_order: item.num_order ?? '',
      num_bon: item.num_bon ?? '',
      num_marche: item.num_marche ?? '',
      num_inventaire: item.num_inventaire ?? '',
      designation: item.designation ?? '',
      providerName: item.providerName ?? '',
      quantity: String(item.quantity ?? 0),
      low_stock_threshold:
        item.low_stock_threshold === null || item.low_stock_threshold === undefined
          ? ''
          : String(item.low_stock_threshold),
      date: item.date ? String(item.date).slice(0, 10) : '',
      type: item.type ?? selectedType,
      categoryId: item.categoryId ? String(item.categoryId) : 'none',
    })
    setIsFormOpen(true)
  }

  function handleReset() {
    setEditingItemId(null)
    setFormValues({ ...emptyFormValues, type: selectedType })
  }

  function handleCreate() {
    handleReset()
    setIsFormOpen(true)
  }

  function handleDeleteRequest(item) {
    setActionMenu(null)
    setItemToDelete(item)
  }

  function handleConfirmDelete() {
    if (!itemToDelete) {
      return
    }

    deleteItemMutation.mutate(itemToDelete.id)
  }

  function handleOpenQuickExit(item) {
    setActionMenu(null)
    setQuickExitItem(item)
    setQuickExitValues(emptyQuickExitValues)
  }

  function handleOpenItemHistory(itemId) {
    setActionMenu(null)
    onOpenItemMovements(itemId)
  }

  function toggleActionMenu(event, item) {
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 224
    const menuHeight = 176
    const viewportPadding = 12
    const nextMenu = {
      itemId: item.id,
      item,
      top: Math.min(rect.bottom + 8, window.innerHeight - menuHeight - viewportPadding),
      left: Math.max(viewportPadding, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)),
    }

    setActionMenu((currentMenu) => {
      if (currentMenu?.itemId === item.id) {
        return null
      }

      return nextMenu
    })
  }

  function toggleExpandedRow(itemId) {
    setExpandedItemId((currentItemId) => (currentItemId === itemId ? null : itemId))
  }

  function handleExportExcel() {
    const rows = displayedItems.map((item) => ({
      Nom: item.name ?? '',
      Désignation: item.designation ?? '',
      "Numéro d'inventaire": item.num_inventaire ?? '',
      Catégorie: item.categoryName ?? 'Sans catégorie',
      Fournisseur: item.providerName ?? '',
      "Quantité initiale": item.quantity ?? 0,
      Reste: item.rest ?? 0,
      'Seuil stock faible': item.low_stock_threshold ?? '',
      Date: item.date ? formatDate(item.date) : '',
      "Numéro de commande": item.num_order ?? '',
      "Numéro de bon": item.num_bon ?? '',
      "Numéro de marché": item.num_marche ?? '',
      Section: getInventorySectionLabel(item.type),
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventaire')
    XLSX.writeFile(workbook, `inventaire-${selectedType}-${new Date().toISOString().slice(0, 10)}.xlsx`)

    window.api?.reports?.logExport({
      label: 'Export inventaire',
      section: selectedType,
      format: 'xlsx',
      filters: {
        section: selectedType,
        categoryId: selectedCategoryId,
        search,
        stockFaibleUniquement: showLowStockOnly,
      },
    })
  }

  function handleExportPdf() {
    if (!window.api?.pdf) {
      throw new Error('Export PDF indisponible.')
    }

    const categoryLabel = selectedCategoryId === 'all'
      ? 'Toutes les categories'
      : categories.find((category) => String(category.id) === selectedCategoryId)?.name ?? 'Categorie inconnue'

    const printableRows = displayedItems.map((item) => `
      <tr>
        <td>${escapeHtml(item.name ?? '-')}</td>
        <td>${escapeHtml(item.designation ?? '-')}</td>
        <td>${escapeHtml(item.num_inventaire ?? '-')}</td>
        <td>${escapeHtml(item.categoryName ?? 'Sans categorie')}</td>
        <td>${escapeHtml(formatDate(item.date))}</td>
        <td>${escapeHtml(item.quantity ?? 0)}</td>
        <td>${escapeHtml(item.rest ?? 0)}</td>
        <td>${escapeHtml(item.low_stock_threshold ?? '-')}</td>
        <td>${escapeHtml(item.providerName ?? '-')}</td>
        <td>${escapeHtml(item.num_order ?? '-')}</td>
        <td>${escapeHtml(item.num_bon ?? '-')}</td>
        <td>${escapeHtml(item.num_marche ?? '-')}</td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>Inventaire ${escapeHtml(getInventorySectionLabel(selectedType))}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 12mm;
            }

            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #0f172a;
              background: #f8fafc;
              font-family: Inter, Arial, Helvetica, sans-serif;
            }
            .page { padding: 22px; }
            .hero {
              padding: 24px 28px;
              border-radius: 18px;
              background: linear-gradient(135deg, #111827 0%, #2563eb 100%);
              color: white;
            }
            .hero h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            .hero p {
              margin: 0;
              font-size: 14px;
              opacity: 0.88;
            }
            .filters {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 12px;
              margin: 18px 0 20px;
            }
            .filter-card {
              padding: 14px 16px;
              border: 1px solid #dbe4f0;
              border-radius: 14px;
              background: white;
            }
            .label {
              display: block;
              margin-bottom: 6px;
              color: #64748b;
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
            }
            .value {
              font-size: 15px;
              font-weight: 600;
            }
            .table-card {
              overflow: hidden;
              border: 1px solid #dbe4f0;
              border-radius: 18px;
              background: white;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            thead th {
              padding: 14px 10px;
              background: #eff6ff;
              color: #1e3a8a;
              font-size: 11px;
              font-weight: 700;
              text-align: left;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            tbody td {
              padding: 11px 10px;
              border-top: 1px solid #e2e8f0;
              font-size: 12px;
              vertical-align: top;
            }
            tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            .footer {
              margin-top: 12px;
              color: #64748b;
              font-size: 12px;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <section class="hero">
              <h1>Inventaire ${escapeHtml(getInventorySectionLabel(selectedType))}</h1>
              <p>Table complete des articles avec quantites, reste, fournisseur et references administratives.</p>
            </section>

            <section class="filters">
              <div class="filter-card"><span class="label">Section</span><span class="value">${escapeHtml(getInventorySectionLabel(selectedType))}</span></div>
              <div class="filter-card"><span class="label">Categorie</span><span class="value">${escapeHtml(categoryLabel)}</span></div>
              <div class="filter-card"><span class="label">Recherche</span><span class="value">${escapeHtml(search || '-')}</span></div>
              <div class="filter-card"><span class="label">Stock faible</span><span class="value">${escapeHtml(showLowStockOnly ? 'Oui' : 'Non')}</span></div>
            </section>

            <section class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Designation</th>
                    <th>Inventaire</th>
                    <th>Categorie</th>
                    <th>Date</th>
                    <th>Quantite</th>
                    <th>Reste</th>
                    <th>Seuil faible</th>
                    <th>Fournisseur</th>
                    <th>No commande</th>
                    <th>No bon</th>
                    <th>No marche</th>
                  </tr>
                </thead>
                <tbody>
                  ${printableRows || '<tr><td colspan="12">Aucun article a exporter.</td></tr>'}
                </tbody>
              </table>
            </section>

            <div class="footer">
              ${escapeHtml(`${displayedItems.length} article${displayedItems.length > 1 ? 's' : ''} exporte${displayedItems.length > 1 ? 's' : ''} le ${new Date().toLocaleString('fr-FR')}`)}
            </div>
          </div>
        </body>
      </html>
    `

    window.api?.pdf.save({
      html,
      fileName: `inventaire-${selectedType}-${new Date().toISOString().slice(0, 10)}.pdf`,
      landscape: true,
    }).then((result) => {
      if (result?.canceled) {
        return
      }

      window.api?.reports?.logExport({
        label: 'Export inventaire PDF',
        section: selectedType,
        format: 'pdf',
        filters: {
          section: selectedType,
          categoryId: selectedCategoryId,
          search,
          stockFaibleUniquement: showLowStockOnly,
        },
      })
    })
  }

  function renderSortHead(columnKey, label, className = '') {
    return (
      <TableHead key={columnKey} className={className}>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-left font-medium"
          onClick={() => handleSort(columnKey)}
        >
          {label}
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
        </button>
      </TableHead>
    )
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Inventaire</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gérez les articles de la section {getInventorySectionLabel(selectedType).toLowerCase()} avec le tri,
          les filtres, les sorties rapides et les exports Excel et PDF.
        </p>
      </div>

      {apiUnavailable ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">
            Interface Electron indisponible. Ouvrez l&apos;application bureau pour gérer l&apos;inventaire.
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Outils rapides</CardTitle>
              <CardDescription>Filtrez, triez et exportez les articles de cette table.</CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={handleCreate} disabled={apiUnavailable || isBusy}>
                Créer un article
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleExportPdf}
                disabled={apiUnavailable || displayedItems.length === 0}
              >
                <FileText className="size-4" />
                Exporter en PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleExportExcel}
                disabled={apiUnavailable || displayedItems.length === 0}
              >
                <FileSpreadsheet className="size-4" />
                Exporter en Excel
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_220px_220px_180px]">
            <div className="space-y-2">
              <Label htmlFor="recherche-inventaire">Recherche</Label>
              <Input
                id="recherche-inventaire"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, numéro, désignation ou fournisseur"
                disabled={isBusy}
              />
            </div>

            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isBusy}>
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

            <div className="space-y-2">
              <Label>Filtre rapide</Label>
              <Button
                type="button"
                variant={showLowStockOnly ? 'default' : 'outline'}
                className="w-full justify-center"
                onClick={() => setShowLowStockOnly((currentValue) => !currentValue)}
                disabled={isBusy}
              >
                {showLowStockOnly ? 'Stock faible activé' : 'Stock faible uniquement'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Nombre d&apos;articles</Label>
              <Input value={String(displayedItems.length)} disabled />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Articles enregistrés</CardTitle>
          <CardDescription>
            {displayedItems.length} article{displayedItems.length > 1 ? 's' : ''} affiché
            {displayedItems.length > 1 ? 's' : ''} dans la section {getInventorySectionLabel(selectedType).toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                {renderSortHead('name', 'Nom')}
                {renderSortHead('num_inventaire', 'Inventaire')}
                {renderSortHead('categoryName', 'Catégorie')}
                {renderSortHead('date', 'Date')}
                {renderSortHead('quantity', 'Quantité')}
                {renderSortHead('low_stock_threshold', 'Seuil faible')}
                {renderSortHead('rest', 'Reste')}
                {renderSortHead('providerName', 'Fournisseur')}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    Chargement des articles...
                  </TableCell>
                </TableRow>
              ) : displayedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    Aucun article trouvé avec les filtres actuels.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => {
                  const isExpanded = expandedItemId === item.id

                  return (
                    <Fragment key={item.id}>
                      {/** Nullable threshold means no low-stock alert for this item. */}
                      <TableRow key={item.id}>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => toggleExpandedRow(item.id)}
                            aria-label={isExpanded ? 'Réduire la ligne' : 'Développer la ligne'}
                          >
                            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="space-y-1">
                            <div>{item.name ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{item.designation}</div>
                          </div>
                        </TableCell>
                        <TableCell>{item.num_inventaire}</TableCell>
                        <TableCell>{item.categoryName ?? 'Sans catégorie'}</TableCell>
                        <TableCell>{formatDate(item.date)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.low_stock_threshold ?? '-'}</TableCell>
                        <TableCell
                          className={
                            item.low_stock_threshold !== null
                            && item.low_stock_threshold !== undefined
                            && item.rest <= item.low_stock_threshold
                              ? 'font-semibold text-destructive'
                              : ''
                          }
                        >
                          {item.rest}
                        </TableCell>
                        <TableCell>{item.providerName ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              data-action-menu-trigger={item.id}
                              onClick={(event) => toggleActionMenu(event, item)}
                              disabled={isBusy}
                              aria-label="Ouvrir les actions"
                              aria-expanded={actionMenu?.itemId === item.id}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded ? (
                        <TableRow key={`${item.id}-details`}>
                          <TableCell colSpan={10} className="bg-muted/20 px-4 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-medium">Trois dernières sorties</p>
                                  <p className="text-sm text-muted-foreground">
                                    Aperçu rapide des déclarations récentes pour cet article.
                                  </p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => onOpenItemMovements(item.id)}>
                                  Voir tout l&apos;historique
                                </Button>
                              </div>

                              {recentMovementsQuery.isLoading ? (
                                <p className="text-sm text-muted-foreground">Chargement des sorties...</p>
                              ) : recentMovements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aucune sortie récente pour cet article.</p>
                              ) : (
                                <div className="space-y-2">
                                  {recentMovements.map((movement) => (
                                    <div
                                      key={movement.id}
                                      className="grid gap-2 rounded-lg border border-border bg-background px-3 py-3 md:grid-cols-[120px_100px_1fr_1fr]"
                                    >
                                      <div>
                                        <p className="text-xs text-muted-foreground">Date</p>
                                        <p className="text-sm font-medium">{formatDate(movement.date || movement.created_at)}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Quantité</p>
                                        <p className="text-sm font-medium">{movement.quantity}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Destinataire</p>
                                        <p className="text-sm font-medium">{movement.party ?? '-'}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Observations</p>
                                        <p className="text-sm font-medium">{movement.observations ?? '-'}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={currentPage}
            pageCount={pageCount}
            totalItems={displayedItems.length}
            pageSize={pageSize}
            onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, pageCount)))}
          />
        </CardContent>
      </Card>

      {actionMenu?.item
        ? createPortal(
            <div
              ref={actionMenuRef}
              className="fixed z-50 flex min-w-56 flex-col rounded-xl border border-border bg-background p-1.5 shadow-xl"
              style={{ top: `${actionMenu.top}px`, left: `${actionMenu.left}px` }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleOpenQuickExit(actionMenu.item)}
                disabled={isBusy}
              >
                <Zap className="size-4" />
                Sortie rapide
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleOpenItemHistory(actionMenu.item.id)}
                disabled={isBusy}
              >
                <Eye className="size-4" />
                Voir tout
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => handleEdit(actionMenu.item)}
                disabled={isBusy}
              >
                <Pencil className="size-4" />
                Modifier
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => handleDeleteRequest(actionMenu.item)}
                disabled={isBusy}
              >
                <Trash2 className="size-4" />
                Supprimer
              </Button>
            </div>,
            document.body,
          )
        : null}

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            handleReset()
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl" showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>{editingItemId === null ? 'Nouvel article' : 'Modifier l\'article'}</DialogTitle>
            <DialogDescription>
              La colonne reste est calculée automatiquement à partir des sorties déclarées.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nom-article">Nom</Label>
                <Input
                  id="nom-article"
                  value={formValues.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="designation">Désignation</Label>
                <Input
                  id="designation"
                  value={formValues.designation}
                  onChange={(event) => handleChange('designation', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="num-inventaire">Numéro d&apos;inventaire</Label>
                <Input
                  id="num-inventaire"
                  value={formValues.num_inventaire}
                  onChange={(event) => handleChange('num_inventaire', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select
                  value={formValues.categoryId}
                  onValueChange={(value) => handleChange('categoryId', value)}
                  disabled={isBusy || apiUnavailable}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans catégorie</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fournisseur">Fournisseur</Label>
                <Input
                  id="fournisseur"
                  value={formValues.providerName}
                  onChange={(event) => handleChange('providerName', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-article">Date</Label>
                <Input
                  id="date-article"
                  type="date"
                  value={formValues.date}
                  onChange={(event) => handleChange('date', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantite">Quantité initiale</Label>
                <Input
                  id="quantite"
                  type="number"
                  min="0"
                  value={formValues.quantity}
                  onChange={(event) => handleChange('quantity', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="seuil-stock-faible">Seuil stock faible</Label>
                <Input
                  id="seuil-stock-faible"
                  type="number"
                  min="0"
                  value={formValues.low_stock_threshold}
                  onChange={(event) => handleChange('low_stock_threshold', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                  placeholder="Laisser vide"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="section-article">Section</Label>
                <Input id="section-article" value={getInventorySectionLabel(selectedType)} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="num-commande">Numéro de commande</Label>
                <Input
                  id="num-commande"
                  value={formValues.num_order}
                  onChange={(event) => handleChange('num_order', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="num-bon">Numéro de bon</Label>
                <Input
                  id="num-bon"
                  value={formValues.num_bon}
                  onChange={(event) => handleChange('num_bon', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="num-marche">Numéro de marché</Label>
                <Input
                  id="num-marche"
                  value={formValues.num_marche}
                  onChange={(event) => handleChange('num_marche', event.target.value)}
                  disabled={isBusy || apiUnavailable}
                />
              </div>
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isBusy}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isBusy || apiUnavailable || !formValues.name.trim()}
              >
                {saveItemMutation.isPending
                  ? 'Enregistrement...'
                  : editingItemId === null
                    ? 'Créer'
                    : 'Mettre à jour'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(quickExitItem)}
        onOpenChange={(open) => {
          if (!open) {
            setQuickExitItem(null)
            setQuickExitValues(emptyQuickExitValues)
          }
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>Sortie rapide</DialogTitle>
            <DialogDescription>
              {quickExitItem
                ? `Enregistrez une sortie rapide pour l'article "${quickExitItem.name ?? quickExitItem.designation}".`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleQuickExitSubmit}>
            {quickExitItem ? (
              <div className="grid gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Reste actuel</p>
                  <p className="text-lg font-semibold">{quickExitItem.rest}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reste après sortie</p>
                  <p className={`text-lg font-semibold ${projectedRest < 0 ? 'text-destructive' : ''}`}>
                    {projectedRest}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="sortie-rapide-quantite">Quantité sortie</Label>
              <Input
                id="sortie-rapide-quantite"
                type="number"
                min="1"
                value={quickExitValues.quantity}
                onChange={(event) => handleQuickExitChange('quantity', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-rapide-date">Date</Label>
              <Input
                id="sortie-rapide-date"
                type="date"
                value={quickExitValues.date}
                onChange={(event) => handleQuickExitChange('date', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-rapide-destinataire">Destinataire</Label>
              <Input
                id="sortie-rapide-destinataire"
                value={quickExitValues.party}
                onChange={(event) => handleQuickExitChange('party', event.target.value)}
                disabled={isBusy || apiUnavailable}
                placeholder="Service, personne ou usage"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-rapide-observations">Observations</Label>
              <Input
                id="sortie-rapide-observations"
                value={quickExitValues.observations}
                onChange={(event) => handleQuickExitChange('observations', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            {projectedRest < 0 ? (
              <p className="text-sm text-destructive">La quantité demandée dépasse le stock disponible.</p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuickExitItem(null)} disabled={isBusy}>
                Annuler
              </Button>
              <Button type="submit" disabled={isBusy || apiUnavailable || isQuickExitInvalid}>
                {quickExitMutation.isPending ? 'Enregistrement...' : 'Enregistrer la sortie'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setItemToDelete(null)
          }
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              {itemToDelete
                ? `Voulez-vous vraiment supprimer l'article "${itemToDelete.name ?? itemToDelete.designation}" ?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setItemToDelete(null)} disabled={isBusy}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={isBusy}>
              Oui, supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export default Inventory
