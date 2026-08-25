"use client"

import * as React from "react"

/**
 * 单元格当前渲染在哪儿：表格行内，还是行详情抽屉里。
 *
 * 同一个字段在两处该长成不同样子——表格里截断成一行才好扫读，抽屉里要铺开看全。
 * 让单元格组件自己读这个上下文换渲染，页面的列定义就只用写一遍。
 */
export type DataTableCellVariant = "cell" | "detail"

const CellVariantContext = React.createContext<DataTableCellVariant>("cell")

export function DataTableCellVariantProvider({
  variant,
  children,
}: {
  variant: DataTableCellVariant
  children: React.ReactNode
}) {
  return <CellVariantContext.Provider value={variant}>{children}</CellVariantContext.Provider>
}

export function useDataTableCellVariant(): DataTableCellVariant {
  return React.useContext(CellVariantContext)
}
