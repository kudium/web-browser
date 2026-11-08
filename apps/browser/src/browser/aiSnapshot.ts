/** Compact public observations only; isolated target receipts stay unchanged. */
export function compactAIPage<
  T extends { elements: Record<string, unknown>[] }
>(page: T) {
  return {
    ...page,
    format: 'compact',
    elements: page.elements.map((element) =>
      Object.fromEntries(
        Object.entries(element).filter(([key, value]) => {
          // Geometry remains available for visual controls. Ordinary DOM actions
          // use the private receipt; request detailed output for their bounds.
          if (key === 'bounds' || key === 'tag')
            return element.tag === 'CANVAS';
          if (value === null || value === undefined) return false;
          // False checked state and empty values are meaningful observations.
          if (
            [
              'disabled',
              'readOnly',
              'valueTruncated',
              'optionsTruncated',
            ].includes(key)
          )
            return value !== false;
          return true;
        })
      )
    ),
  };
}
