import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export default function Button({ variant = 'primary', children, ...props }: ButtonProps) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>;
}
