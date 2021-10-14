#include <stdio.h>

int main(){
    char *text = "I would like a snack\n";
    int length, x;

    length = strlen(text);
    for(x=0;x<length;x++){
        putchar(*(text+x));
    }
    return(0);
}

//solution of the challenge is down below
/*
int main()
{
	int f[5] = { 13, 21, 34, 55, 89 };
	int x;
	int *pf;

	pf = f;
	printf("Base address = %p\n",pf);
	printf("Size of int = %lu\n",sizeof(int));
	for(x=0;x<5;x++)
	{
		printf("%p %d\n",pf,*pf);
		pf++;
	}

	return(0);
}
*/




