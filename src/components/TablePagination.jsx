import { Button } from '@/components/ui/button'

function TablePagination({ page, pageCount, totalItems, pageSize, onPageChange }) {
  if (totalItems === 0) {
    return null
  }

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Affichage de {startItem} à {endItem} sur {totalItems}
      </p>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Précédent
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          Page {page} sur {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
        >
          Suivant
        </Button>
      </div>
    </div>
  )
}

export default TablePagination
