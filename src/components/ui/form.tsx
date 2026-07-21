"use client";;
import { Form as FormPrimitive } from "@base-ui/react/form";

export function Form(
  {
    className,
    ...props
  }
) {
  return <FormPrimitive className={className} data-slot="form" {...props} />;
}

export { FormPrimitive };
