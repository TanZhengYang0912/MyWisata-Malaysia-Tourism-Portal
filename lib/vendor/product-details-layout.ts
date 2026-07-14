export function getProductDetailsLayoutClasses() {
  return {
    drawer: 'flex flex-col',
    content: 'min-h-0 flex-1 overflow-y-auto',
    actions: 'sticky bottom-0 border-t bg-white',
    pricing: 'mt-6',
  } as const;
}
