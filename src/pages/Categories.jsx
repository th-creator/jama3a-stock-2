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
import { inventorySections } from '@/lib/inventory-sections'

const typeOptions = [
  { value: 'all', label: 'Toutes les sections' },
  ...inventorySections,
]

function getCategoryApi() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.api?.categories ?? null
}

function Categories() {
  const pageSize = 10
  const queryClient = useQueryClient()
  const categoryApi = getCategoryApi()
  const apiUnavailable = !categoryApi
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState(null)
  const [page, setPage] = useState(1)
  const [formValues, setFormValues] = useState({
    name: '',
    type: 'all',
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => {
      if (!categoryApi) {
        throw new Error('Interface Electron indisponible.')
      }

      return categoryApi.list({ type: 'all' })
    },
    enabled: Boolean(categoryApi),
  })

  const saveCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryApi) {
        throw new Error('Interface Electron indisponible.')
      }

      const payload = {
        name: formValues.name,
        type: formValues.type,
      }

      if (editingCategoryId === null) {
        return categoryApi.create(payload)
      }

      return categoryApi.update(editingCategoryId, payload)
    },
    onSuccess: async () => {
      setEditingCategoryId(null)
      setFormValues({ name: '', type: 'all' })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      await queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId) => {
      if (!categoryApi) {
        throw new Error('Interface Electron indisponible.')
      }

      return categoryApi.delete(categoryId)
    },
    onSuccess: async () => {
      if (editingCategoryId !== null) {
        setEditingCategoryId(null)
        setFormValues({ name: '', type: 'all' })
      }

      setCategoryToDelete(null)

      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      await queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const isBusy = saveCategoryMutation.isPending || deleteCategoryMutation.isPending
  const queryErrorMessage = categoriesQuery.error?.message
  const mutationErrorMessage = saveCategoryMutation.error?.message || deleteCategoryMutation.error?.message
  const errorMessage = queryErrorMessage || mutationErrorMessage

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const pageCount = Math.max(1, Math.ceil(categories.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const paginatedCategories = useMemo(
    () => categories.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [categories, currentPage],
  )

  function handleChange(field, value) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!formValues.name.trim()) {
      return
    }

    saveCategoryMutation.mutate()
  }

  function handleEdit(category) {
    setEditingCategoryId(category.id)
    setFormValues({
      name: category.name,
      type: category.type,
    })
    setIsFormOpen(true)
  }

  function handleReset() {
    setEditingCategoryId(null)
    setFormValues({ name: '', type: 'all' })
  }

  function handleCreate() {
    handleReset()
    setIsFormOpen(true)
  }

  function handleDeleteRequest(category) {
    setCategoryToDelete(category)
  }

  function handleConfirmDelete() {
    if (!categoryToDelete) {
      return
    }

    deleteCategoryMutation.mutate(categoryToDelete.id)
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catégories</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gérez les catégories utilisées pour classer les articles de votre stock.
        </p>
      </div>

      {apiUnavailable ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 text-sm text-destructive">
            Interface Electron indisponible. Ouvrez l&apos;application bureau pour gérer les
            catégories.
          </CardContent>
        </Card>
      ) : null}

      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Outils des catégories</CardTitle>
              <CardDescription>
                Centralisez les actions de gestion avant de consulter la liste des catégories.
              </CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" onClick={handleCreate} disabled={apiUnavailable || isBusy}>
                Créer une catégorie
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Liste des catégories</CardTitle>
          <CardDescription>
            {categories.length} catégorie{categories.length > 1 ? 's' : ''} enregistrée
            {categories.length > 1 ? 's' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Date de création</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoriesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Chargement des catégories...
                    </TableCell>
                  </TableRow>
                ) : categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Aucune catégorie disponible.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell>
                        {typeOptions.find((option) => option.value === category.type)?.label ??
                          category.type}
                      </TableCell>
                      <TableCell>
                        {category.created_at
                          ? new Date(category.created_at).toLocaleDateString('fr-FR')
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(category)}
                            disabled={isBusy}
                          >
                            Modifier
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteRequest(category)}
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
              totalItems={categories.length}
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
            <DialogTitle>
              {editingCategoryId === null ? 'Nouvelle catégorie' : 'Modifier la catégorie'}
            </DialogTitle>
            <DialogDescription>
              Associez une catégorie à toutes les sections ou à une section précise.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="categorie-nom">Nom</Label>
              <Input
                id="categorie-nom"
                value={formValues.name}
                onChange={(event) => handleChange('name', event.target.value)}
                disabled={isBusy || apiUnavailable}
                placeholder="Exemple : Informatique"
              />
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={formValues.type}
                onValueChange={(value) => handleChange('type', value)}
                disabled={isBusy || apiUnavailable}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir une section" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isBusy}>
                Annuler
              </Button>
              <Button type="submit" disabled={isBusy || apiUnavailable || !formValues.name.trim()}>
                {saveCategoryMutation.isPending
                  ? 'Enregistrement...'
                  : editingCategoryId === null
                    ? 'Créer'
                    : 'Mettre à jour'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryToDelete(null)
          }
        }}
      >
        <DialogContent showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              {categoryToDelete
                ? `Voulez-vous vraiment supprimer la catégorie "${categoryToDelete.name}" ?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryToDelete(null)} disabled={isBusy}>
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

export default Categories
