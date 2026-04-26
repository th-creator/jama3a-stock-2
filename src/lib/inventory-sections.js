export const inventorySections = [
  { value: 'meteriel', label: 'Matériel' },
  { value: 'ferronnerie', label: 'Ferronnerie' },
  { value: 'peinture', label: 'Peinture' },
  { value: 'electrique', label: 'Électrique' },
  { value: 'achat', label: 'Achats' },
  { value: 'produit', label: 'Produits' },
  { value: 'signalisation', label: 'Signalisation' },
  { value: 'petit-materiel', label: 'Petit matériel' },
  { value: 'technique', label: 'Technique' },
]

export function getInventorySectionLabel(value) {
  return inventorySections.find((section) => section.value === value)?.label ?? value
}
