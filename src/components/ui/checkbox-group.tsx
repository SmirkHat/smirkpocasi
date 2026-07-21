"use client";;
import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";
import { cn } from "@/lib/utils";

export function CheckboxGroup(
  {
    className,
    ...props
  }
) {
  return (<CheckboxGroupPrimitive className={cn("flex flex-col items-start gap-3", className)} {...props} />);
}

export { CheckboxGroupPrimitive };
