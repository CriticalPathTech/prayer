// React 19 moved JSX types under React.JSX; re-export as the global JSX namespace
// so existing `JSX.Element` annotations continue to work without a mass rename.
// This file must remain an ambient declaration file (no top-level import/export).
declare namespace JSX {
  type Element = import('react').JSX.Element;
  type ElementClass = import('react').JSX.ElementClass;
  type ElementAttributesProperty = import('react').JSX.ElementAttributesProperty;
  type ElementChildrenAttribute = import('react').JSX.ElementChildrenAttribute;
  type LibraryManagedAttributes<C, P> = import('react').JSX.LibraryManagedAttributes<C, P>;
  type IntrinsicAttributes = import('react').JSX.IntrinsicAttributes;
  type IntrinsicClassAttributes<T> = import('react').JSX.IntrinsicClassAttributes<T>;
  type IntrinsicElements = import('react').JSX.IntrinsicElements;
}
