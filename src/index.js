const {
  keysetPagingSelect,
  offsetPagingSelect,
  interpretForOffsetPaging,
  interpretForKeysetPaging
} = require('join-monster/dist/stringifiers/shared');

const dialect = module.exports = {
  name: 'bigquery',

  quote(str) {
    return `\`${str}\``
  },

  compositeKey(parent, keys) {
    keys = keys.map(key => `\`${parent}\`.\`${key}\``)
    return `NULLIF(CONCAT(${keys.join(', ')}), '')`
  },

  // FIXME
  handleJoinedOneToManyPaginated: async function(parent, node, context, tables, joinCondition) {
    const pagingWhereConditions = [
      await node.sqlJoin(`\`${parent.as}\``, `\`${node.as}\``, node.args || {}, context, node)
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`\`${node.as}\``, node.args || {}, context, node)
      )
    }

    // which type of pagination are they using?
    if (node.sortKey) {
      const { limit, order, whereCondition: whereAddendum } = interpretForKeysetPaging(node, dialect)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        keysetPagingSelect(node.name, pagingWhereConditions, order, limit, node.as, { joinCondition, joinType: 'LEFT' })
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, dialect)
      tables.push(
        offsetPagingSelect(node.name, pagingWhereConditions, order, limit, offset, node.as, {
          joinCondition, joinType: 'LEFT'
        })
      )
    }
  },

  // FIXME
  handleBatchedManyToManyPaginated: async function(parent, node, context, tables, batchScope, joinCondition) {
    const pagingWhereConditions = [
      `\`${node.junction.as}\`.\`${node.junction.sqlBatch.thisKey.name}\` = temp.\`${node.junction.sqlBatch.parentKey.name}\``
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(`\`${node.junction.as}\``, node.args || {}, context, node)
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`"${node.as}"`, node.args || {}, context, node)
      )
    }

    const tempTable = `FROM (VALUES ${batchScope.map(val => `(${val})`)}) temp("${node.junction.sqlBatch.parentKey.name}")`
    tables.push(tempTable)
    const lateralJoinCondition = `\`${node.junction.as}\`.\`${node.junction.sqlBatch.thisKey.name}\` = temp.\`${node.junction.sqlBatch.parentKey.name}\``

    const lateralJoinOptions = { joinCondition: lateralJoinCondition, joinType: 'LEFT' }
    if (node.where || node.orderBy) {
      lateralJoinOptions.extraJoin = {
        name: node.name,
        as: node.as,
        condition: joinCondition
      }
    }
    if (node.sortKey || node.junction.sortKey) {
      const { limit, order, whereCondition: whereAddendum } = interpretForKeysetPaging(node, dialect)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        keysetPagingSelect(node.junction.sqlTable, pagingWhereConditions, order, limit, node.junction.as, lateralJoinOptions)
      )
    } else if (node.orderBy || node.junction.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, dialect)
      tables.push(
        offsetPagingSelect(
          node.junction.sqlTable, pagingWhereConditions, order,
          limit, offset, node.junction.as, lateralJoinOptions
        )
      )
    }
    tables.push(`LEFT JOIN ${node.name} AS \`${node.as}\` ON ${joinCondition}`)
  },

  // FIXME
  handleJoinedManyToManyPaginated: async function(parent, node, context, tables, joinCondition1, joinCondition2) {
    const pagingWhereConditions = [
      await node.junction.sqlJoins[0](`\`${parent.as}\``, `\`${node.junction.as}\``, node.args || {}, context, node)
    ]
    if (node.junction.where) {
      pagingWhereConditions.push(
        await node.junction.where(`\`${node.junction.as}\``, node.args || {}, context, node)
      )
    }
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`\`${node.as}\``, node.args || {}, context, node)
      )
    }

    const lateralJoinOptions = { joinCondition: joinCondition1, joinType: 'LEFT' }
    if (node.where || node.orderBy) {
      lateralJoinOptions.extraJoin = {
        name: node.name,
        as: node.as,
        condition: joinCondition2
      }
    }
    if (node.sortKey || node.junction.sortKey) {
      const { limit, order, whereCondition: whereAddendum } = interpretForKeysetPaging(node, dialect)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        keysetPagingSelect(node.junction.sqlTable, pagingWhereConditions, order, limit, node.junction.as, lateralJoinOptions)
      )
    } else if (node.orderBy || node.junction.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, dialect)
      tables.push(
        offsetPagingSelect(
          node.junction.sqlTable, pagingWhereConditions, order,
          limit, offset, node.junction.as, lateralJoinOptions
        )
      )
    }
  },

  handlePaginationAtRoot: async function(parent, node, context, tables) {
    const pagingWhereConditions = []
    if (node.sortKey) {
      const { limit, order, whereCondition: whereAddendum } = interpretForKeysetPaging(node, dialect)
      pagingWhereConditions.push(whereAddendum)
      if (node.where) {
        pagingWhereConditions.push(
          await node.where(`\`${node.as}\``, node.args || {}, context, node)
        )
      }
      tables.push(
        keysetPagingSelect(node.name, pagingWhereConditions, order, limit, node.as)
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, dialect)
      if (node.where) {
        pagingWhereConditions.push(
          await node.where(`"${node.as}"`, node.args || {}, context, node)
        )
      }
      tables.push(
        offsetPagingSelect(node.name, pagingWhereConditions, order, limit, offset, node.as)
      )
    }
  },

  handleBatchedOneToManyPaginated: async function(parent, node, context, tables, batchScope) {
    const pagingWhereConditions = [
      `\`${node.as}\`.\`${node.sqlBatch.thisKey.name}\` = temp.\`${node.sqlBatch.parentKey.name}\``
    ]
    if (node.where) {
      pagingWhereConditions.push(
        await node.where(`\`${node.as}\``, node.args || {}, context, node)
      )
    }
    const tempTable = `FROM (VALUES ${batchScope.map(val => `(${val})`)}) temp(\`${node.sqlBatch.parentKey.name}\`)`
    tables.push(tempTable)
    const lateralJoinCondition = `\`${node.as}\`.\`${node.sqlBatch.thisKey.name}\` = temp.\`${node.sqlBatch.parentKey.name}\``
    if (node.sortKey) {
      const { limit, order, whereCondition: whereAddendum } = interpretForKeysetPaging(node, dialect)
      pagingWhereConditions.push(whereAddendum)
      tables.push(
        keysetPagingSelect(node.name, pagingWhereConditions, order, limit, node.as, { joinCondition: lateralJoinCondition })
      )
    } else if (node.orderBy) {
      const { limit, offset, order } = interpretForOffsetPaging(node, dialect)
      tables.push(
        offsetPagingSelect(node.name, pagingWhereConditions, order, limit, offset, node.as, {
          joinCondition: lateralJoinCondition
        })
      )
    }
  }
}
