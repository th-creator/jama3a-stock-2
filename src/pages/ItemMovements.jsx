import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import TablePagination from '@/components/TablePagination.jsx'
import { getInventorySectionLabel } from '@/lib/inventory-sections'

const emptyFormValues = {
  quantity: '1',
  date: '',
  party: '',
  observations: '',
}

function getMovementsApi() {
  if (typeof window === 'undefined') {
    return null
  }

  return {
    items: window.api?.items ?? null,
    movements: window.api?.movements ?? null,
  }
}

function ItemMovements({ itemId, onBack }) {
  const pageSize = 10
  const queryClient = useQueryClient()
  const api = getMovementsApi()
  const apiUnavailable = !api?.items || !api?.movements
  const [editingMovementId, setEditingMovementId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [movementToDelete, setMovementToDelete] = useState(null)
  const [page, setPage] = useState(1)
  const [formValues, setFormValues] = useState(emptyFormValues)

  const itemQuery = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => {
      if (!api?.items) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.items.get(itemId)
    },
    enabled: !apiUnavailable && itemId !== null,
  })

  const movementsQuery = useQuery({
    queryKey: ['movements', itemId],
    queryFn: () => {
      if (!api?.movements) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.movements.list({ itemId })
    },
    enabled: !apiUnavailable && itemId !== null,
  })

  const saveMovementMutation = useMutation({
    mutationFn: async () => {
      if (!api?.movements) {
        throw new Error('Interface Electron indisponible.')
      }

      const payload = {
        item_id: itemId,
        quantity: Number(formValues.quantity),
        date: formValues.date,
        party: formValues.party,
        observations: formValues.observations,
      }

      if (editingMovementId === null) {
        return api.movements.create(payload)
      }

      return api.movements.update(editingMovementId, payload)
    },
    onSuccess: async () => {
      setEditingMovementId(null)
      setFormValues(emptyFormValues)
      await queryClient.invalidateQueries({ queryKey: ['movements', itemId] })
      await queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      await queryClient.invalidateQueries({ queryKey: ['items'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const deleteMovementMutation = useMutation({
    mutationFn: async (movementId) => {
      if (!api?.movements) {
        throw new Error('Interface Electron indisponible.')
      }

      return api.movements.delete(movementId)
    },
    onSuccess: async () => {
      if (editingMovementId !== null) {
        setEditingMovementId(null)
        setFormValues(emptyFormValues)
      }

      setMovementToDelete(null)

      await queryClient.invalidateQueries({ queryKey: ['movements', itemId] })
      await queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      await queryClient.invalidateQueries({ queryKey: ['items'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const item = itemQuery.data ?? null
  const movements = useMemo(() => movementsQuery.data ?? [], [movementsQuery.data])
  const pageCount = Math.max(1, Math.ceil(movements.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedMovements = useMemo(
    () => movements.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [movements, currentPage],
  )
  const isBusy = saveMovementMutation.isPending || deleteMovementMutation.isPending
  const errorMessage =
    itemQuery.error?.message ||
    movementsQuery.error?.message ||
    saveMovementMutation.error?.message ||
    deleteMovementMutation.error?.message

  function handleChange(field, value) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!formValues.quantity || Number(formValues.quantity) <= 0) {
      return
    }

    saveMovementMutation.mutate()
  }

  function handleEdit(movement) {
    setEditingMovementId(movement.id)
    setFormValues({
      quantity: String(movement.quantity),
      date: movement.date ? String(movement.date).slice(0, 10) : '',
      party: movement.party ?? '',
      observations: movement.observations ?? '',
    })
    setIsFormOpen(true)
  }

  function handleReset() {
    setEditingMovementId(null)
    setFormValues(emptyFormValues)
  }

  function handleCreate() {
    handleReset()
    setIsFormOpen(true)
  }

  function handleDeleteRequest(movement) {
    setMovementToDelete(movement)
  }

  function handleConfirmDelete() {
    if (!movementToDelete) {
      return
    }

    deleteMovementMutation.mutate(movementToDelete.id)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sorties du produit</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Consultez l&apos;historique des sorties et ajoutez de nouvelles déclarations.
          </p>
        </div>
      </div>

      {apiUnavailable ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">
            Interface Electron indisponible. Ouvrez l&apos;application bureau pour gérer les sorties.
          </CardContent>
        </Card>
      ) : null}

      {item ? (
        <Card className="border border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>{item.name ?? item.designation}</CardTitle>
            <CardDescription>
              {item.designation} · {getInventorySectionLabel(item.type)} · {item.num_inventaire}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Quantité initiale</p>
              <p className="text-xl font-semibold">{item.quantity}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Reste actuel</p>
              <p className="text-xl font-semibold">{item.rest}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Catégorie</p>
              <p className="text-xl font-semibold">{item.categoryName ?? 'Sans catégorie'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fournisseur</p>
              <p className="text-xl font-semibold">{item.providerName ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Outils des sorties</CardTitle>
              <CardDescription>
                Regroupez les actions principales avant de consulter l&apos;historique du produit.
              </CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onBack}>
                Retour à l&apos;inventaire
              </Button>
              <Button type="button" onClick={handleCreate} disabled={apiUnavailable || isBusy}>
                Créer une sortie
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Historique des sorties</CardTitle>
          <CardDescription>
            {movements.length} déclaration{movements.length > 1 ? 's' : ''} enregistrée
            {movements.length > 1 ? 's' : ''} pour ce produit.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Quantité</TableHead>
                  <TableHead>Destinataire</TableHead>
                  <TableHead>Observations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Chargement des sorties...
                    </TableCell>
                  </TableRow>
                ) : movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Aucune sortie enregistrée pour ce produit.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        {movement.date
                          ? new Date(movement.date).toLocaleDateString('fr-FR')
                          : new Date(movement.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>{movement.quantity}</TableCell>
                      <TableCell>{movement.party ?? '-'}</TableCell>
                      <TableCell>{movement.observations ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(movement)}
                            disabled={isBusy}
                          >
                            Modifier
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteRequest(movement)}
                            disabled={isBusy}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={currentPage}
              pageCount={pageCount}
              totalItems={movements.length}
              pageSize={pageSize}
              onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, pageCount)))}
            />
        </CardContent>
      </Card>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            handleReset()
          }
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>{editingMovementId === null ? 'Nouvelle sortie' : 'Modifier la sortie'}</DialogTitle>
            <DialogDescription>
              Chaque déclaration réduit automatiquement le reste disponible du produit.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="sortie-quantite">Quantité sortie</Label>
              <Input
                id="sortie-quantite"
                type="number"
                min="1"
                value={formValues.quantity}
                onChange={(event) => handleChange('quantity', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-date">Date</Label>
              <Input
                id="sortie-date"
                type="date"
                value={formValues.date}
                onChange={(event) => handleChange('date', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-party">Destinataire</Label>
              <Input
                id="sortie-party"
                value={formValues.party}
                onChange={(event) => handleChange('party', event.target.value)}
                disabled={isBusy || apiUnavailable}
                placeholder="Service, personne ou usage"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortie-observations">Observations</Label>
              <Input
                id="sortie-observations"
                value={formValues.observations}
                onChange={(event) => handleChange('observations', event.target.value)}
                disabled={isBusy || apiUnavailable}
              />
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isBusy}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isBusy || apiUnavailable || !formValues.quantity || Number(formValues.quantity) <= 0}
              >
                {saveMovementMutation.isPending
                  ? 'Enregistrement...'
                  : editingMovementId === null
                    ? 'Créer'
                    : 'Mettre à jour'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(movementToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setMovementToDelete(null)
          }
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment supprimer cette déclaration de sortie ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMovementToDelete(null)} disabled={isBusy}>
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

export default ItemMovements
