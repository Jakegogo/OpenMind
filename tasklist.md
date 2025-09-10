# Tasklist

## Completed
- [x] 将以下方法从 `main.ts` 迁移至工具模块并保持逻辑不变：`addChildUnder`、`focusEditorToRange`、`updateAddButtonPosition`、`updateHoverPopupPosition`、`extractNodeImmediateBody`
- [x] 将工具由函数式改为面向对象（过渡期：`MindmapTools`）
- [x] 引入独立控制器类：`PopupController` 与 `ButtonController`
- [x] `main.ts` 接入控制器：替换旧调用，删除 `makeButtonDeps`/`makePopupDeps`
- [x] 在控制器中集中管理依赖与状态：`containerElDiv`、`jm`、`app`、`plugin`、`file`、`lastFileContent`、`headingsCache` 等
- [x] 在 `onOpen`/`refresh`/`softSyncFromDisk`/`setFile` 中同步运行时上下文到控制器
- [x] 清理 `main.ts` 中不再需要的属性：`addButtonEl`、`deleteButtonEl`、`addButtonForNodeId`、`addButtonRAF`、`hoverPopupEl`、`hoverPopupForNodeId`、`hoverPopupRAF`、`hoverHideTimeoutId`
- [x] 还原并强化 hover 行为：从节点快速移入 popup 不隐藏；仅从 popup 移出后（含延时容错）才隐藏
- [x] 事件监听类型修正（必要处使用 `as any` 通过 TS 重载校验）
- [x] 解决隐式 any 报警：`rebuildStableKeyIndex` 内 `parent` 显式类型化
- [x] Resize/滚动时按钮位置更新改为 `ButtonController.updatePosition()`
- [x] `refresh` 过程中按钮状态由控制器接管
- [x] 删除废弃类型与旧工具类：`CommonDeps`、`PopupState`、`ButtonState`、`MindmapTools`

## Pending
- [ ] 清理 `collapsedByFile` 私有属性访问的 linter 报警（添加公开 getter/setter 或调整可见性），不改动业务逻辑
