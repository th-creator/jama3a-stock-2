import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

function getDesktopApi() {
  if (typeof window === 'undefined') {
    return null
  }

  const candidateApi = window.api

  if (!candidateApi || typeof candidateApi.login !== 'function') {
    return null
  }

  return candidateApi
}

function Login({ onLoginSuccess }) {
  const desktopApi = getDesktopApi()
  const desktopApiUnavailable = !desktopApi

  const loginMutation = useMutation({
    mutationFn: async (values) => {
      if (!desktopApi) {
        throw new Error(
          'Interface Electron indisponible. Lancez l\'application avec `npm run desktop:dev`.',
        )
      }

      const response = await desktopApi.login(values)

      if (!response?.success) {
        throw new Error('Identifiants invalides.')
      }

      return response.user
    },
    onSuccess: (user) => {
      onLoginSuccess(user)
    },
  })

  const form = useForm({
    defaultValues: {
      username: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      loginMutation.reset()
      await loginMutation.mutateAsync(value)
    },
  })

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md border border-border/60 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Connexion</CardTitle>
          <CardDescription>
            Connectez-vous pour accéder à votre espace de gestion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {desktopApiUnavailable ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Interface Electron indisponible. Ouvrez la fenêtre bureau avec{' '}
              <span className="font-medium">npm run desktop:dev</span>.
            </div>
          ) : null}

          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              form.handleSubmit()
            }}
          >
            <form.Field
              name="username"
              validators={{
                onSubmit: ({ value }) =>
                  value.trim() ? undefined : 'Le nom d\'utilisateur est requis.',
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Nom d&apos;utilisateur</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    autoComplete="username"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    disabled={loginMutation.isPending || desktopApiUnavailable}
                  />
                  {field.state.meta.errors[0] ? (
                    <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onSubmit: ({ value }) =>
                  value ? undefined : 'Le mot de passe est requis.',
              }}
            >
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Mot de passe</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={field.state.meta.errors.length > 0}
                    disabled={loginMutation.isPending || desktopApiUnavailable}
                  />
                  {field.state.meta.errors[0] ? (
                    <p className="text-sm text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            {loginMutation.error ? (
              <p className="text-sm text-destructive">{loginMutation.error.message}</p>
            ) : null}

            <form.Subscribe selector={(state) => [state.canSubmit]}>
              {([canSubmit]) => (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!canSubmit || loginMutation.isPending || desktopApiUnavailable}
                >
                  {loginMutation.isPending ? 'Connexion en cours...' : 'Se connecter'}
                </Button>
              )}
            </form.Subscribe>

            <p className="text-center text-sm text-muted-foreground">
              Identifiants par défaut : <span className="font-medium">admin</span> /{' '}
              <span className="font-medium">admin123</span>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

export default Login
