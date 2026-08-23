import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: 'They Call It Earth',
	description: 'Strategic world map prototype for They Call It Earth.',
};

export default function RootLayout({
	children,
}: {
    children: React.ReactNode;
}) {
	return (
		<html lang="ko">
			<body>{children}</body>
		</html>
	);
}
