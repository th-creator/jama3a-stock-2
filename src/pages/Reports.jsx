import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import * as XLSX from 'xlsx'

import TablePagination from '@/components/TablePagination.jsx'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { getInventorySectionLabel, inventorySections } from '@/lib/inventory-sections'

function getDefaultStartDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  return date.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  const parsedDate = parseDateValue(value)

  if (!parsedDate) {
    return '-'
  }

  return parsedDate.toLocaleString('fr-FR')
}

function parseDateValue(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const normalizedValue = String(value).trim()

  if (!normalizedValue) {
    return null
  }

  const sqliteMatch = normalizedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  )

  if (sqliteMatch) {
    const [, year, month, day, hours = '00', minutes = '00', seconds = '00', milliseconds = '0'] = sqliteMatch
    const parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      Number(milliseconds.padEnd(3, '0')),
    )

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
  }

  const parsedDate = new Date(normalizedValue)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function getArticleLabel(record) {
  return record.name || record.designation || record.num_inventaire || `Article ${record.id}`
}

function getRecordDate(record) {
  return record.date || record.created_at || null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isWithinDateRange(value, startDate, endDate) {
  const parsedRecordDate = parseDateValue(value)

  if (!parsedRecordDate) {
    return false
  }

  const recordDate = parsedRecordDate.getTime()

  if (startDate) {
    const start = parseDateValue(`${startDate} 00:00:00`)?.getTime()
    if (start === undefined) {
      return false
    }

    if (recordDate < start) {
      return false
    }
  }

  if (endDate) {
    const end = parseDateValue(`${endDate} 23:59:59.999`)?.getTime()
    if (end === undefined) {
      return false
    }

    if (recordDate > end) {
      return false
    }
  }

  return true
}

function Reports() {
  const pageSize = 15
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    startDate: getDefaultStartDate(),
    endDate: new Date().toISOString().slice(0, 10),
    movementType: 'all',
    section: 'all',
  })

  const reportsQuery = useQuery({
    queryKey: ['reports', 'article-movements', filters.section],
    queryFn: async () => {
      if (!window.api?.items || !window.api?.movements) {
        throw new Error('Interface Electron indisponible.')
      }

      const selectedSection = filters.section === 'all' ? '' : filters.section
      const [items, movements] = await Promise.all([
        window.api.items.list({ type: selectedSection }),
        window.api.movements.list({}),
      ])

      return { items, movements }
    },
  })

  const rows = useMemo(() => {
    const items = reportsQuery.data?.items ?? []
    const movements = reportsQuery.data?.movements ?? []

    const entryRows = items
      .filter(() => filters.movementType === 'all' || filters.movementType === 'entree')
      .filter((item) => isWithinDateRange(getRecordDate(item), filters.startDate, filters.endDate))
      .map((item) => ({
        id: `entry-${item.id}`,
        rawDate: getRecordDate(item),
        type: 'Entree',
        section: item.type,
        article: getArticleLabel(item),
        number: item.num_inventaire ?? '-',
        quantity: item.quantity ?? 0,
        provider: item.providerName ?? '-',
        destinataire: '-',
      }))

    const exitRows = movements
      .filter(() => filters.movementType === 'all' || filters.movementType === 'sortie')
      .filter((movement) => filters.section === 'all' || movement.type === filters.section)
      .filter((movement) => isWithinDateRange(getRecordDate(movement), filters.startDate, filters.endDate))
      .map((movement) => ({
        id: `exit-${movement.id}`,
        rawDate: getRecordDate(movement),
        type: 'Sortie',
        section: movement.type,
        article: getArticleLabel(movement),
        number: movement.num_inventaire ?? '-',
        quantity: movement.quantity ?? 0,
        provider: '-',
        destinataire: movement.party ?? '-',
      }))

    return [...entryRows, ...exitRows].sort((leftRow, rightRow) => {
      const leftDate = parseDateValue(leftRow.rawDate)?.getTime() ?? 0
      const rightDate = parseDateValue(rightRow.rawDate)?.getTime() ?? 0
      return rightDate - leftDate
    })
  }, [filters.endDate, filters.movementType, filters.section, filters.startDate, reportsQuery.data])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedRows = useMemo(
    () => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [rows, currentPage],
  )

  function handleFilterChange(field, value) {
    setPage(1)
    setFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }))
  }

  async function handleExportExcel() {
    const exportRows = rows.map((row) => ({
      Date: formatDateTime(row.rawDate),
      Type: row.type,
      Section: row.section ? getInventorySectionLabel(row.section) : '-',
      Article: row.article,
      Numero: row.number,
      Quantite: row.quantity,
      Fournisseur: row.provider,
      Destinataire: row.destinataire,
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rapports')
    XLSX.writeFile(workbook, `rapport-articles-${new Date().toISOString().slice(0, 10)}.xlsx`)

    await window.api?.reports?.logExport({
      label: 'Export rapport articles',
      section: filters.section === 'all' ? null : filters.section,
      format: 'xlsx',
      filters,
    })
  }

  async function handleExportPdf() {
    if (!window.api?.pdf) {
      throw new Error('Export PDF indisponible.')
    }

    const activeSection = filters.section === 'all' ? 'Toutes les sections' : getInventorySectionLabel(filters.section)
    const activeType = filters.movementType === 'all'
      ? 'Tous les types'
      : filters.movementType === 'entree'
        ? 'Entree'
        : 'Sortie'

    const printableRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.rawDate))}</td>
        <td><span class="badge ${row.type === 'Entree' ? 'badge-entree' : 'badge-sortie'}">${escapeHtml(row.type)}</span></td>
        <td>${escapeHtml(row.section ? getInventorySectionLabel(row.section) : '-')}</td>
        <td>${escapeHtml(row.article)}</td>
        <td>${escapeHtml(row.number)}</td>
        <td>${escapeHtml(row.quantity)}</td>
        <td>${escapeHtml(row.provider)}</td>
        <td>${escapeHtml(row.destinataire)}</td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>Rapport articles</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 14mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              color: #0f172a;
              background: #f8fafc;
              font-family: Inter, Arial, Helvetica, sans-serif;
            }

            .page {
              padding: 24px;
            }

            .hero {
              padding: 24px 28px;
              border-radius: 18px;
              background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%);
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

            .filter-card .label {
              display: block;
              margin-bottom: 6px;
              color: #64748b;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.06em;
            }

            .filter-card .value {
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
              padding: 14px 12px;
              background: #eff6ff;
              color: #1e3a8a;
              font-size: 12px;
              font-weight: 700;
              text-align: left;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }

            tbody td {
              padding: 12px;
              border-top: 1px solid #e2e8f0;
              font-size: 13px;
              vertical-align: top;
            }

            tbody tr:nth-child(even) {
              background: #f8fafc;
            }

            .badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 999px;
              font-size: 11px;
              font-weight: 700;
            }

            .badge-entree {
              color: #166534;
              background: #dcfce7;
            }

            .badge-sortie {
              color: #9a3412;
              background: #ffedd5;
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
              <h1>Rapport des mouvements d'articles</h1>
              <p>Vue complete des entrees et sorties avec quantites, fournisseurs et destinataires.</p>
            </section>

            <section class="filters">
              <div class="filter-card">
                <span class="label">Date de debut</span>
                <span class="value">${escapeHtml(filters.startDate || '-')}</span>
              </div>
              <div class="filter-card">
                <span class="label">Date de fin</span>
                <span class="value">${escapeHtml(filters.endDate || '-')}</span>
              </div>
              <div class="filter-card">
                <span class="label">Type</span>
                <span class="value">${escapeHtml(activeType)}</span>
              </div>
              <div class="filter-card">
                <span class="label">Section</span>
                <span class="value">${escapeHtml(activeSection)}</span>
              </div>
            </section>

            <section class="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Section</th>
                    <th>Article</th>
                    <th>Numero</th>
                    <th>Quantite</th>
                    <th>Fournisseur</th>
                    <th>Destinataire</th>
                  </tr>
                </thead>
                <tbody>
                  ${printableRows || '<tr><td colspan="8">Aucune ligne a exporter.</td></tr>'}
                </tbody>
              </table>
            </section>

            <div class="footer">
              ${escapeHtml(`${rows.length} ligne${rows.length > 1 ? 's' : ''} exportee${rows.length > 1 ? 's' : ''} le ${new Date().toLocaleString('fr-FR')}`)}
            </div>
          </div>
        </body>
      </html>
    `

    const result = await window.api.pdf.save({
      html,
      fileName: `rapport-articles-${new Date().toISOString().slice(0, 10)}.pdf`,
      landscape: true,
    })

    if (result?.canceled) {
      return
    }

    await window.api?.reports?.logExport({
      label: 'Export PDF rapport articles',
      section: filters.section === 'all' ? null : filters.section,
      format: 'pdf',
      filters,
    })
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Rapports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Consultez uniquement les articles entrés et sortis, avec la quantité, le fournisseur et le destinataire.
        </p>
      </div>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Outils du rapport</CardTitle>
              <CardDescription>Affinez les mouvements par période et par section, puis exportez-les.</CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleExportPdf} disabled={rows.length === 0}>
              <FileText className="size-4" />
              Exporter en PDF
            </Button>
            <Button type="button" variant="outline" onClick={handleExportExcel} disabled={rows.length === 0}>
              Exporter en Excel
            </Button>
          </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="rapport-debut">Date de début</Label>
            <Input
              id="rapport-debut"
              type="date"
              value={filters.startDate}
              onChange={(event) => handleFilterChange('startDate', event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rapport-fin">Date de fin</Label>
            <Input
              id="rapport-fin"
              type="date"
              value={filters.endDate}
              onChange={(event) => handleFilterChange('endDate', event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={filters.movementType} onValueChange={(value) => handleFilterChange('movementType', value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tous les types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="entree">Entree</SelectItem>
                <SelectItem value="sortie">Sortie</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={filters.section} onValueChange={(value) => handleFilterChange('section', value)}>
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
        </CardContent>
      </Card>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Mouvements des articles</CardTitle>
          <CardDescription>
            {rows.length} ligne{rows.length > 1 ? 's' : ''} trouvée{rows.length > 1 ? 's' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Article</TableHead>
                <TableHead>Numero</TableHead>
                <TableHead>Quantite</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Destinataire</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Chargement des mouvements...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Aucun mouvement d'article enregistre pour cette periode.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.rawDate)}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.section ? getInventorySectionLabel(row.section) : '-'}</TableCell>
                    <TableCell className="font-medium">{row.article}</TableCell>
                    <TableCell>{row.number}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>{row.destinataire}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            page={currentPage}
            pageCount={pageCount}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, pageCount)))}
          />
        </CardContent>
      </Card>
    </section>
  )
}

export default Reports
