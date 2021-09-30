#include <stdio.h>

int safe_input(char *buffer, unsigned length );

int main()
{
	char buffer[32];

	printf("Your name: ");
	fflush(stdout);
	safe_input(buffer,32);
	printf("Pleased to meet you, %s!\n",buffer);

	return 0;
}
