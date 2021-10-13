#include <stdio.h>

char *repeat(char r)
{
	int x;
	static char string[32]; //array need to be static so to be populated

	for(x=0;x<32;x++)
		string[x] = r;

	return string;
}

int main()
{
	char c;

	printf("Type a character: ");
	scanf("%c",&c);
	printf("%s\n",repeat(c));

	return(0);
}

