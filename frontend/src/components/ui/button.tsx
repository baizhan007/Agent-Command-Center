import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const variants = cva('button inline-flex items-center justify-center gap-2 transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: { primary: 'primary', secondary: 'secondary', ghost: 'ghost' },
    size: { default: '', compact: 'compact', icon: 'icon-size' },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
})

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(variants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'
