/* include stdio.h isn't needed because
   the assembly module does the output */

/* you still must prototype the function */
void message(void);

int main()
{
	int x;

	for( x=0; x<5; x++ )
		message();

	return(0);
}
