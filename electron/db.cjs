const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')

const DEFAULT_USER = {
  username: 'admin',
  password: 'admin123',
}

let database

const createSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'all',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    num_order TEXT,
    num_bon TEXT,
    num_marche TEXT,
    num_inventaire TEXT,
    designation TEXT,
    providerName TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    rest INTEGER NOT NULL DEFAULT 0,
    date DATETIME,
    type TEXT NOT NULL,
    categoryId INTEGER,
    low_stock_threshold INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    date DATETIME,
    party TEXT,
    observations TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    section TEXT,
    label TEXT,
    details TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
  CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(categoryId);
  CREATE INDEX IF NOT EXISTS idx_movements_item_id ON movements(item_id);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_entity_type ON operation_logs(entity_type);
`

function ensureString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function ensureNullableString(value) {
  const normalizedValue = ensureString(value)
  return normalizedValue ? normalizedValue : null
}

function ensureInteger(value, defaultValue = 0) {
  const normalizedValue = Number.parseInt(value, 10)
  return Number.isInteger(normalizedValue) ? normalizedValue : defaultValue
}

function ensureNullableInteger(value) {
  const normalizedValue = Number.parseInt(value, 10)
  return Number.isInteger(normalizedValue) ? normalizedValue : null
}

function ensureNullableDate(value) {
  const normalizedValue = ensureString(value)
  return normalizedValue ? normalizedValue : null
}

function ensureRequired(value, fieldName) {
  const normalizedValue = ensureString(value)

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required`)
  }

  return normalizedValue
}

function normalizeCategoryInput(payload = {}) {
  return {
    name: ensureRequired(payload.name, 'Category name'),
    type: ensureString(payload.type) || 'all',
  }
}

function normalizeItemInput(payload = {}) {
  const lowStockThreshold = ensureNullableInteger(payload.low_stock_threshold)

  if (lowStockThreshold !== null && lowStockThreshold < 0) {
    throw new Error('Low stock threshold must be greater than or equal to zero')
  }

  return {
    name: ensureNullableString(payload.name),
    num_order: ensureNullableString(payload.num_order),
    num_bon: ensureNullableString(payload.num_bon),
    num_marche: ensureNullableString(payload.num_marche),
    num_inventaire: ensureNullableString(payload.num_inventaire),
    designation: ensureNullableString(payload.designation),
    providerName: ensureNullableString(payload.providerName),
    quantity: ensureInteger(payload.quantity, 0),
    rest: ensureInteger(payload.rest, 0),
    date: ensureNullableDate(payload.date),
    type: ensureRequired(payload.type, 'Item type'),
    categoryId: ensureNullableInteger(payload.categoryId),
    low_stock_threshold: lowStockThreshold,
  }
}

function ensureColumnExists(tableName, columnName, columnDefinition) {
  const columns = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all()
  const hasColumn = columns.some((column) => column.name === columnName)

  if (!hasColumn) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}

function ensureItemsNullableColumns() {
  const columns = getDatabase().prepare('PRAGMA table_info(items)').all()
  const inventoryColumn = columns.find((column) => column.name === 'num_inventaire')
  const designationColumn = columns.find((column) => column.name === 'designation')
  const requiresMigration = inventoryColumn?.notnull === 1 || designationColumn?.notnull === 1

  if (!requiresMigration) {
    return
  }

  getDatabase().exec(`
    BEGIN TRANSACTION;
    ALTER TABLE items RENAME TO items_legacy;
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      num_order TEXT,
      num_bon TEXT,
      num_marche TEXT,
      num_inventaire TEXT,
      designation TEXT,
      providerName TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      rest INTEGER NOT NULL DEFAULT 0,
      date DATETIME,
      type TEXT NOT NULL,
      categoryId INTEGER,
      low_stock_threshold INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE
    );
    INSERT INTO items (
      id,
      name,
      num_order,
      num_bon,
      num_marche,
      num_inventaire,
      designation,
      providerName,
      quantity,
      rest,
      date,
      type,
      categoryId,
      low_stock_threshold,
      created_at,
      updated_at
    )
    SELECT
      id,
      name,
      num_order,
      num_bon,
      num_marche,
      num_inventaire,
      designation,
      providerName,
      quantity,
      rest,
      date,
      type,
      categoryId,
      NULL,
      created_at,
      updated_at
    FROM items_legacy;
    DROP TABLE items_legacy;
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(categoryId);
    COMMIT;
  `)
}

function ensureMovementsForeignKeyReferencesItems() {
  const foreignKeys = getDatabase().prepare('PRAGMA foreign_key_list(movements)').all()
  const itemForeignKey = foreignKeys.find((foreignKey) => foreignKey.from === 'item_id')

  if (!itemForeignKey || itemForeignKey.table === 'items') {
    return
  }

  getDatabase().exec(`
    BEGIN TRANSACTION;
    ALTER TABLE movements RENAME TO movements_legacy;
    CREATE TABLE movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      date DATETIME,
      party TEXT,
      observations TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE
    );
    INSERT INTO movements (
      id,
      item_id,
      quantity,
      date,
      party,
      observations,
      created_at
    )
    SELECT
      id,
      item_id,
      quantity,
      date,
      party,
      observations,
      created_at
    FROM movements_legacy;
    DROP TABLE movements_legacy;
    CREATE INDEX IF NOT EXISTS idx_movements_item_id ON movements(item_id);
    COMMIT;
  `)
}

function normalizeMovementInput(payload = {}) {
  return {
    item_id: ensureNullableInteger(payload.item_id),
    quantity: ensureInteger(payload.quantity, 0),
    date: ensureNullableDate(payload.date),
    party: ensureNullableString(payload.party),
    observations: ensureNullableString(payload.observations),
  }
}

function ensureCategoryExists(categoryId) {
  if (categoryId === null) {
    return
  }

  const existingCategory = getDatabase()
    .prepare('SELECT id FROM categories WHERE id = ? LIMIT 1')
    .get(categoryId)

  if (!existingCategory) {
    throw new Error('Category not found')
  }
}

function ensureItemExists(itemId) {
  const existingItem = getDatabase()
    .prepare('SELECT id FROM items WHERE id = ? LIMIT 1')
    .get(itemId)

  if (!existingItem) {
    throw new Error('Item not found')
  }
}

function ensureMovementExists(movementId) {
  const existingMovement = getDatabase()
    .prepare('SELECT id FROM movements WHERE id = ? LIMIT 1')
    .get(movementId)

  if (!existingMovement) {
    throw new Error('Movement not found')
  }
}

function getItemRow(itemId) {
  return getDatabase()
    .prepare('SELECT id, quantity FROM items WHERE id = ? LIMIT 1')
    .get(itemId)
}

function getMovementRow(movementId) {
  return getDatabase()
    .prepare('SELECT id, item_id, quantity FROM movements WHERE id = ? LIMIT 1')
    .get(movementId)
}

function getMovementTotalForItem(itemId) {
  const result = getDatabase()
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM movements WHERE item_id = ?')
    .get(itemId)

  return result?.total ?? 0
}

function getMovementTotalForItemExcluding(itemId, movementId) {
  const result = getDatabase()
    .prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM movements WHERE item_id = ? AND id != ?',
    )
    .get(itemId, movementId)

  return result?.total ?? 0
}

function recalculateItemRest(itemId) {
  const item = getItemRow(itemId)

  if (!item) {
    throw new Error('Item not found')
  }

  const totalUsed = getMovementTotalForItem(itemId)
  const nextRest = Math.max(0, item.quantity - totalUsed)

  getDatabase()
    .prepare('UPDATE items SET rest = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(nextRest, itemId)

  return nextRest
}

function getDashboardDateThreshold(monthsBack) {
  const normalizedMonthsBack = ensureInteger(monthsBack, 3)
  const thresholdDate = new Date()
  thresholdDate.setMonth(thresholdDate.getMonth() - normalizedMonthsBack)
  return thresholdDate.toISOString()
}

function createOperationLog({ entityType, entityId = null, action, section = null, label = null, details = null }) {
  getDatabase()
    .prepare(
      `
        INSERT INTO operation_logs (entity_type, entity_id, action, section, label, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(entityType, entityId, action, section, label, details ? JSON.stringify(details) : null)
}

function getMovementLabel(movement) {
  return movement?.name || movement?.designation || movement?.num_inventaire || `Sortie ${movement?.id ?? ''}`.trim()
}

function validateMovementQuantity(itemId, movementQuantity, movementIdToIgnore = null) {
  const item = getItemRow(itemId)

  if (!item) {
    throw new Error('Item not found')
  }

  if (movementQuantity <= 0) {
    throw new Error('Movement quantity must be greater than zero')
  }

  const currentTotalUsed = movementIdToIgnore === null
    ? getMovementTotalForItem(itemId)
    : getMovementTotalForItemExcluding(itemId, movementIdToIgnore)

  if (currentTotalUsed + movementQuantity > item.quantity) {
    throw new Error('Movement quantity exceeds available stock')
  }
}

function getDatabase() {
  if (!database) {
    throw new Error('Database has not been initialized')
  }

  return database
}

async function initializeDatabase(userDataPath) {
  if (database) {
    return database
  }

  const databaseDirectory = path.join(userDataPath, 'data')
  fs.mkdirSync(databaseDirectory, { recursive: true })

  database = new Database(path.join(databaseDirectory, 'inventory-desktop2.sqlite'))
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')

  database.exec(createSchema)
  ensureColumnExists('items', 'name', 'TEXT')
  ensureColumnExists('items', 'low_stock_threshold', 'INTEGER')
  ensureItemsNullableColumns()
  ensureMovementsForeignKeyReferencesItems()

  const existingUser = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(DEFAULT_USER.username)

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 12)

    database
      .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .run(DEFAULT_USER.username, passwordHash)
  }

  return database
}

async function login({ username, password }) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : ''
  const normalizedPassword = typeof password === 'string' ? password : ''

  if (!normalizedUsername || !normalizedPassword) {
    return { success: false }
  }

  const user = getDatabase()
    .prepare('SELECT id, username, password FROM users WHERE username = ? LIMIT 1')
    .get(normalizedUsername)

  if (!user) {
    return { success: false }
  }

  const passwordMatches = await bcrypt.compare(normalizedPassword, user.password)

  if (!passwordMatches) {
    return { success: false }
  }

  createOperationLog({
    entityType: 'auth',
    entityId: user.id,
    action: 'login',
    label: user.username,
    details: { username: user.username },
  })

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
    },
  }
}

function listCategories(filters = {}) {
  const requestedType = ensureString(filters.type)

  if (!requestedType || requestedType === 'all') {
    return getDatabase()
      .prepare(
        `
          SELECT id, name, type, created_at
          FROM categories
          ORDER BY name COLLATE NOCASE ASC, id ASC
        `,
      )
      .all()
  }

  return getDatabase()
    .prepare(
      `
        SELECT id, name, type, created_at
        FROM categories
        WHERE type = 'all' OR type = ?
        ORDER BY name COLLATE NOCASE ASC, id ASC
      `,
    )
    .all(requestedType)
}

function createCategory(payload = {}) {
  const values = normalizeCategoryInput(payload)
  const result = getDatabase()
    .prepare('INSERT INTO categories (name, type) VALUES (?, ?)')
    .run(values.name, values.type)

  const category = getCategoryById(result.lastInsertRowid)
  createOperationLog({
    entityType: 'category',
    entityId: category.id,
    action: 'create',
    section: category.type,
    label: category.name,
    details: { after: category },
  })

  return category
}

function getCategoryById(categoryId) {
  return getDatabase()
    .prepare('SELECT id, name, type, created_at FROM categories WHERE id = ? LIMIT 1')
    .get(categoryId)
}

function updateCategory(categoryId, payload = {}) {
  const normalizedCategoryId = ensureNullableInteger(categoryId)

  if (normalizedCategoryId === null) {
    throw new Error('Category id is required')
  }

  ensureCategoryExists(normalizedCategoryId)
  const previousCategory = getCategoryById(normalizedCategoryId)

  const values = normalizeCategoryInput(payload)

  getDatabase()
    .prepare('UPDATE categories SET name = ?, type = ? WHERE id = ?')
    .run(values.name, values.type, normalizedCategoryId)

  const category = getCategoryById(normalizedCategoryId)
  createOperationLog({
    entityType: 'category',
    entityId: category.id,
    action: 'update',
    section: category.type,
    label: category.name,
    details: { before: previousCategory, after: category },
  })

  return category
}

function deleteCategory(categoryId) {
  const normalizedCategoryId = ensureNullableInteger(categoryId)

  if (normalizedCategoryId === null) {
    throw new Error('Category id is required')
  }

  const category = getCategoryById(normalizedCategoryId)

  if (!category) {
    throw new Error('Category not found')
  }

  getDatabase().prepare('DELETE FROM categories WHERE id = ?').run(normalizedCategoryId)
  createOperationLog({
    entityType: 'category',
    entityId: normalizedCategoryId,
    action: 'delete',
    section: category.type,
    label: category.name,
    details: { before: category },
  })

  return { success: true }
}

function listItems(filters = {}) {
  const conditions = []
  const values = []
  const requestedType = ensureString(filters.type)
  const requestedSearch = ensureString(filters.search)
  const requestedCategoryId = ensureNullableInteger(filters.categoryId)

  if (requestedType) {
    conditions.push('items.type = ?')
    values.push(requestedType)
  }

  if (requestedCategoryId !== null) {
    conditions.push('items.categoryId = ?')
    values.push(requestedCategoryId)
  }

  if (requestedSearch) {
    conditions.push('(items.name LIKE ? OR items.num_inventaire LIKE ? OR items.designation LIKE ? OR items.providerName LIKE ?)')
    values.push(`%${requestedSearch}%`, `%${requestedSearch}%`, `%${requestedSearch}%`, `%${requestedSearch}%`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return getDatabase()
    .prepare(
      `
        SELECT
          items.id,
          items.name,
          items.num_order,
          items.num_bon,
          items.num_marche,
          items.num_inventaire,
          items.designation,
          items.providerName,
          items.quantity,
          items.rest,
          items.date,
          items.type,
          items.categoryId,
          items.low_stock_threshold,
          items.created_at,
          items.updated_at,
          categories.name AS categoryName,
          categories.type AS categoryType
        FROM items
        LEFT JOIN categories ON categories.id = items.categoryId
        ${whereClause}
        ORDER BY items.created_at DESC, items.id DESC
      `,
    )
    .all(...values)
}

function getItemById(itemId) {
  return getDatabase()
    .prepare(
      `
        SELECT
          items.id,
          items.name,
          items.num_order,
          items.num_bon,
          items.num_marche,
          items.num_inventaire,
          items.designation,
          items.providerName,
          items.quantity,
          items.rest,
          items.date,
          items.type,
          items.categoryId,
          items.low_stock_threshold,
          items.created_at,
          items.updated_at,
          categories.name AS categoryName,
          categories.type AS categoryType
        FROM items
        LEFT JOIN categories ON categories.id = items.categoryId
        WHERE items.id = ?
        LIMIT 1
      `,
    )
    .get(itemId)
}

function createItem(payload = {}) {
  const values = normalizeItemInput(payload)
  ensureCategoryExists(values.categoryId)

  const result = getDatabase()
    .prepare(
      `
        INSERT INTO items (
          name,
          num_order,
          num_bon,
          num_marche,
          num_inventaire,
          designation,
          providerName,
          quantity,
          rest,
          date,
          type,
          categoryId,
          low_stock_threshold,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    )
    .run(
      values.name,
      values.num_order,
      values.num_bon,
      values.num_marche,
      values.num_inventaire,
      values.designation,
      values.providerName,
      values.quantity,
      values.quantity,
      values.date,
      values.type,
      values.categoryId,
      values.low_stock_threshold,
    )

  recalculateItemRest(result.lastInsertRowid)
  const item = getItemById(result.lastInsertRowid)
  createOperationLog({
    entityType: 'item',
    entityId: item.id,
    action: 'create',
    section: item.type,
    label: item.name || item.designation || item.num_inventaire || `Article ${item.id}`,
    details: { after: item },
  })

  return item
}

function updateItem(itemId, payload = {}) {
  const normalizedItemId = ensureNullableInteger(itemId)

  if (normalizedItemId === null) {
    throw new Error('Item id is required')
  }

  ensureItemExists(normalizedItemId)
  const previousItem = getItemById(normalizedItemId)

  const values = normalizeItemInput(payload)
  ensureCategoryExists(values.categoryId)

  getDatabase()
    .prepare(
      `
        UPDATE items
        SET
          name = ?,
          num_order = ?,
          num_bon = ?,
          num_marche = ?,
          num_inventaire = ?,
          designation = ?,
          providerName = ?,
          quantity = ?,
          rest = ?,
          date = ?,
          type = ?,
          categoryId = ?,
          low_stock_threshold = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    )
    .run(
      values.name,
      values.num_order,
      values.num_bon,
      values.num_marche,
      values.num_inventaire,
      values.designation,
      values.providerName,
      values.quantity,
      values.quantity,
      values.date,
      values.type,
      values.categoryId,
      values.low_stock_threshold,
      normalizedItemId,
    )

  recalculateItemRest(normalizedItemId)
  const item = getItemById(normalizedItemId)
  createOperationLog({
    entityType: 'item',
    entityId: item.id,
    action: 'update',
    section: item.type,
    label: item.name || item.designation || item.num_inventaire || `Article ${item.id}`,
    details: { before: previousItem, after: item },
  })

  return item
}

function deleteItem(itemId) {
  const normalizedItemId = ensureNullableInteger(itemId)

  if (normalizedItemId === null) {
    throw new Error('Item id is required')
  }

  const item = getItemById(normalizedItemId)

  if (!item) {
    throw new Error('Item not found')
  }

  getDatabase().prepare('DELETE FROM items WHERE id = ?').run(normalizedItemId)
  createOperationLog({
    entityType: 'item',
    entityId: normalizedItemId,
    action: 'delete',
    section: item.type,
    label: item.name || item.designation || item.num_inventaire || `Article ${normalizedItemId}`,
    details: { before: item },
  })

  return { success: true }
}

function listMovements(filters = {}) {
  const requestedItemId = ensureNullableInteger(filters.itemId)

  if (requestedItemId === null) {
    return getDatabase()
      .prepare(
        `
          SELECT
            movements.id,
            movements.item_id,
            movements.quantity,
            movements.date,
            movements.party,
            movements.observations,
            movements.created_at,
            items.name,
            items.designation,
            items.num_inventaire,
            items.type
          FROM movements
          INNER JOIN items ON items.id = movements.item_id
          ORDER BY movements.date DESC, movements.id DESC
        `,
      )
      .all()
  }

  return getDatabase()
    .prepare(
      `
        SELECT
          movements.id,
          movements.item_id,
          movements.quantity,
          movements.date,
          movements.party,
          movements.observations,
          movements.created_at,
          items.name,
          items.designation,
          items.num_inventaire,
          items.type
        FROM movements
        INNER JOIN items ON items.id = movements.item_id
        WHERE movements.item_id = ?
        ORDER BY movements.date DESC, movements.id DESC
      `,
    )
    .all(requestedItemId)
}

function getMovementById(movementId) {
  return getDatabase()
    .prepare(
      `
        SELECT
          movements.id,
          movements.item_id,
          movements.quantity,
          movements.date,
          movements.party,
          movements.observations,
          movements.created_at,
          items.name,
          items.designation,
          items.num_inventaire,
          items.type
        FROM movements
        INNER JOIN items ON items.id = movements.item_id
        WHERE movements.id = ?
        LIMIT 1
      `,
    )
    .get(movementId)
}

function createMovement(payload = {}) {
  const values = normalizeMovementInput(payload)

  if (values.item_id === null) {
    throw new Error('Item id is required')
  }

  ensureItemExists(values.item_id)
  validateMovementQuantity(values.item_id, values.quantity)

  const result = getDatabase()
    .prepare(
      `
        INSERT INTO movements (item_id, quantity, date, party, observations)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(values.item_id, values.quantity, values.date, values.party, values.observations)

  recalculateItemRest(values.item_id)
  const movement = getMovementById(result.lastInsertRowid)
  createOperationLog({
    entityType: 'movement',
    entityId: movement.id,
    action: 'create',
    section: movement.type,
    label: getMovementLabel(movement),
    details: { after: movement },
  })

  return movement
}

function updateMovement(movementId, payload = {}) {
  const normalizedMovementId = ensureNullableInteger(movementId)

  if (normalizedMovementId === null) {
    throw new Error('Movement id is required')
  }

  const previousMovement = getMovementById(normalizedMovementId)
  const existingMovement = getMovementRow(normalizedMovementId)

  if (!existingMovement) {
    throw new Error('Movement not found')
  }

  const values = normalizeMovementInput(payload)

  if (values.item_id === null) {
    throw new Error('Item id is required')
  }

  ensureItemExists(values.item_id)
  validateMovementQuantity(values.item_id, values.quantity, normalizedMovementId)

  getDatabase()
    .prepare(
      `
        UPDATE movements
        SET item_id = ?, quantity = ?, date = ?, party = ?, observations = ?
        WHERE id = ?
      `,
    )
    .run(
      values.item_id,
      values.quantity,
      values.date,
      values.party,
      values.observations,
      normalizedMovementId,
    )

  recalculateItemRest(existingMovement.item_id)

  if (existingMovement.item_id !== values.item_id) {
    recalculateItemRest(values.item_id)
  }

  const movement = getMovementById(normalizedMovementId)
  createOperationLog({
    entityType: 'movement',
    entityId: movement.id,
    action: 'update',
    section: movement.type,
    label: getMovementLabel(movement),
    details: { before: previousMovement, after: movement },
  })

  return movement
}

function deleteMovement(movementId) {
  const normalizedMovementId = ensureNullableInteger(movementId)

  if (normalizedMovementId === null) {
    throw new Error('Movement id is required')
  }

  const movement = getMovementById(normalizedMovementId)
  const existingMovement = getMovementRow(normalizedMovementId)

  if (!existingMovement) {
    throw new Error('Movement not found')
  }

  getDatabase().prepare('DELETE FROM movements WHERE id = ?').run(normalizedMovementId)
  recalculateItemRest(existingMovement.item_id)
  createOperationLog({
    entityType: 'movement',
    entityId: normalizedMovementId,
    action: 'delete',
    section: movement?.type ?? null,
    label: getMovementLabel(movement),
    details: { before: movement },
  })

  return { success: true }
}

function listLowStockItems(filters = {}) {
  const requestedType = ensureString(filters.type)
  const values = []
  let typeCondition = ''

  if (requestedType) {
    typeCondition = 'AND items.type = ?'
    values.push(requestedType)
  }

  return getDatabase()
    .prepare(
      `
        SELECT
          items.id,
          items.name,
          items.designation,
          items.num_inventaire,
          items.rest,
          items.quantity,
          items.type,
          items.categoryId,
          items.low_stock_threshold,
          categories.name AS categoryName
        FROM items
        LEFT JOIN categories ON categories.id = items.categoryId
        WHERE items.low_stock_threshold IS NOT NULL
          AND items.rest <= items.low_stock_threshold
        ${typeCondition}
        ORDER BY items.rest ASC, items.designation COLLATE NOCASE ASC
        LIMIT 20
      `,
    )
    .all(...values)
}

function listMostUsedItems(filters = {}) {
  const requestedType = ensureString(filters.type)
  const requestedCategoryId = ensureNullableInteger(filters.categoryId)
  const months = ensureInteger(filters.months, 3)
  const values = [getDashboardDateThreshold(months)]
  const conditions = ['movements.created_at >= ?']

  if (requestedType) {
    conditions.push('items.type = ?')
    values.push(requestedType)
  }

  if (requestedCategoryId !== null) {
    conditions.push('items.categoryId = ?')
    values.push(requestedCategoryId)
  }

  return getDatabase()
    .prepare(
      `
        SELECT
          items.id,
          items.name,
          items.designation,
          items.num_inventaire,
          items.type,
          items.categoryId,
          categories.name AS categoryName,
          SUM(movements.quantity) AS totalUsed,
          MAX(COALESCE(movements.date, movements.created_at)) AS lastMovementDate
        FROM movements
        INNER JOIN items ON items.id = movements.item_id
        LEFT JOIN categories ON categories.id = items.categoryId
        WHERE ${conditions.join(' AND ')}
        GROUP BY items.id, items.name, items.designation, items.num_inventaire, items.type, items.categoryId, categories.name
        ORDER BY totalUsed DESC, items.designation COLLATE NOCASE ASC
        LIMIT 20
      `,
    )
    .all(...values)
}

function listOperationLogs(filters = {}) {
  const conditions = []
  const values = []
  const startDate = ensureString(filters.startDate)
  const endDate = ensureString(filters.endDate)
  const entityType = ensureString(filters.entityType)
  const action = ensureString(filters.action)
  const section = ensureString(filters.section)

  if (startDate) {
    conditions.push('created_at >= ?')
    values.push(startDate)
  }

  if (endDate) {
    conditions.push('created_at <= ?')
    values.push(endDate)
  }

  if (entityType && entityType !== 'all') {
    conditions.push('entity_type = ?')
    values.push(entityType)
  }

  if (action && action !== 'all') {
    conditions.push('action = ?')
    values.push(action)
  }

  if (section && section !== 'all') {
    conditions.push('section = ?')
    values.push(section)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return getDatabase()
    .prepare(
      `
        SELECT id, entity_type, entity_id, action, section, label, details, created_at
        FROM operation_logs
        ${whereClause}
        ORDER BY created_at DESC, id DESC
      `,
    )
    .all(...values)
    .map((log) => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
    }))
}

function logReportExport(payload = {}) {
  createOperationLog({
    entityType: 'report',
    action: 'export',
    section: ensureString(payload.section) || null,
    label: ensureString(payload.label) || 'Export rapport',
    details: {
      format: ensureString(payload.format) || 'xlsx',
      filters: payload.filters ?? null,
    },
  })

  return { success: true }
}

function closeDatabase() {
  if (database) {
    database.close()
    database = undefined
  }
}

module.exports = {
  createCategory,
  createItem,
  createMovement,
  closeDatabase,
  deleteCategory,
  deleteItem,
  deleteMovement,
  listLowStockItems,
  listMostUsedItems,
  listOperationLogs,
  getCategoryById,
  getItemById,
  getMovementById,
  initializeDatabase,
  listCategories,
  listItems,
  listMovements,
  logReportExport,
  login,
  updateCategory,
  updateItem,
  updateMovement,
}
