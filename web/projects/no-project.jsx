import { Alert, Button, Container, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { startLink } from '/projects/start-link.js';

// NoProject is what a section of the AI service shows to somebody without a project there: access comes only from a budget, so the way to one instead of an error.
export function NoProject({ title, text }) {
    const { t } = useTranslation();
    return (
        <Container size="md" py="md">
            <Alert color="blue" variant="light" title={title}>
                <Text size="sm" mb="sm">{text}</Text>
                <Button component="a" href={startLink('aiaas')}>{t('projects.start.getOne')}</Button>
            </Alert>
        </Container>
    );
}
